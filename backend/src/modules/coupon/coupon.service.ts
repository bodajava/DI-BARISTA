import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto';
import { CouponDiscountType } from '../../common/enums';
import { runInBackground } from '../../common/utilities/background';
import { EmailService, EmailTemplates } from '../../common/utilities/emails';
import { isUniqueViolation, pageArgs, paginated, PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCouponDto, SendCouponToBuyersDto, UpdateCouponDto, ValidateCouponDto } from './dto';

export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'OFF' | 'USED_UP';

export function couponState(coupon: Coupon, now = new Date()): CouponState {
  if (!coupon.isActive) return 'OFF';
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return 'USED_UP';
  if (coupon.endDate.getTime() <= now.getTime()) return 'EXPIRED';
  if (coupon.startDate.getTime() > now.getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  private view(coupon: Coupon) {
    return { ...coupon, state: couponState(coupon) };
  }

  private static assertDiscount(type: CouponDiscountType, value: number): void {
    if (type === CouponDiscountType.PERCENTAGE && value > 90) {
      throw new BadRequestException('A percentage discount cannot be more than 90%');
    }
  }

  async create(dto: CreateCouponDto, userId: string) {
    const code = dto.code.toUpperCase().trim();
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('The end date must be after the start date');
    }
    CouponService.assertDiscount(dto.discountType, dto.discountValue);
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code,
          note: dto.note?.trim() || null,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          minOrderAmountCents: dto.minOrderAmountCents ?? 0,
          maxDiscountAmountCents: dto.maxDiscountAmountCents ?? null,
          startDate,
          endDate,
          usageLimit: dto.usageLimit ?? null,
          perCustomerLimit: dto.perCustomerLimit ?? null,
          allowedEmails: (dto.allowedEmails ?? []).map((e) => e.toLowerCase().trim()),
          isActive: dto.isActive ?? true,
          createdById: userId,
        },
      });
      await this.audit.log(userId, 'coupon.create', 'coupon', coupon.id, null, { code });
      return this.view(coupon);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`The code "${code}" already exists`);
      throw error;
    }
  }

  async findAll(query: PaginationQueryDto) {
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const where: Prisma.CouponWhereInput = {
      deletedAt: null,
      ...(query.search?.trim() ? { code: { contains: query.search.trim().toUpperCase() } } : {}),
    };
    const [docs, total] = await Promise.all([
      this.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.coupon.count({ where }),
    ]);
    return paginated(docs.map((c) => this.view(c)), total, page, limit);
  }

  async update(id: string, dto: UpdateCouponDto, userId?: string) {
    const existing = await this.prisma.coupon.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This coupon no longer exists');

    const data: Prisma.CouponUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code.toUpperCase().trim();
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.discountType !== undefined) data.discountType = dto.discountType;
    if (dto.discountValue !== undefined) data.discountValue = dto.discountValue;
    if (dto.minOrderAmountCents !== undefined) data.minOrderAmountCents = dto.minOrderAmountCents;
    if (dto.maxDiscountAmountCents !== undefined) data.maxDiscountAmountCents = dto.maxDiscountAmountCents;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.usageLimit !== undefined) data.usageLimit = dto.usageLimit;
    if (dto.perCustomerLimit !== undefined) data.perCustomerLimit = dto.perCustomerLimit;
    if (dto.allowedEmails !== undefined) data.allowedEmails = dto.allowedEmails.map((e) => e.toLowerCase().trim());
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const start = (data.startDate as Date | undefined) ?? existing.startDate;
    const end = (data.endDate as Date | undefined) ?? existing.endDate;
    if (end.getTime() <= start.getTime()) throw new BadRequestException('The end date must be after the start date');
    CouponService.assertDiscount(dto.discountType ?? existing.discountType, dto.discountValue ?? existing.discountValue);

    try {
      const updated = await this.prisma.coupon.update({ where: { id }, data });
      await this.audit.log(userId, 'coupon.update', 'coupon', id, { code: existing.code }, dto);
      return this.view(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`The code "${dto.code}" already exists`);
      throw error;
    }
  }

  /** A coupon that was already used is switched off instead, so past orders keep their link */
  async remove(id: string, userId?: string): Promise<{ message: string; switchedOff: boolean; code: string }> {
    const existing = await this.prisma.coupon.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This coupon no longer exists');
    if (existing.usedCount > 0) {
      await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
      await this.audit.log(userId, 'coupon.disable', 'coupon', id, { code: existing.code }, { isActive: false });
      return {
        message: `${existing.code} was used before, so it was switched off instead of deleted`,
        switchedOff: true,
        code: existing.code,
      };
    }
    await this.prisma.coupon.delete({ where: { id } });
    await this.audit.log(userId, 'coupon.delete', 'coupon', id, { code: existing.code }, null);
    return { message: `${existing.code} was deleted`, switchedOff: false, code: existing.code };
  }

  /** Email a code to everyone who ordered, to subscribers, or to a pasted list (sent in the background) */
  async sendCouponToBuyers(dto: SendCouponToBuyersDto) {
    const code = dto.code.toUpperCase().trim();
    const coupon = await this.prisma.coupon.findFirst({ where: { code, deletedAt: null } });
    if (!coupon || !coupon.isActive) throw new NotFoundException(`No active coupon "${code}"`);

    let emails: string[];
    if (dto.audience === 'buyers') {
      const rows = await this.prisma.order.findMany({
        where: { deletedAt: null },
        distinct: ['customerEmail'],
        select: { customerEmail: true },
      });
      emails = rows.map((r) => r.customerEmail);
    } else if (dto.audience === 'subscribers') {
      const rows = await this.prisma.subscriber.findMany({
        where: { deletedAt: null, isActive: true },
        select: { email: true },
      });
      emails = rows.map((r) => r.email);
    } else {
      emails = dto.emails ?? [];
    }
    emails = Array.from(new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean)));
    if (emails.length === 0) throw new BadRequestException('Nobody to send it to');
    // Gmail sends about 500 emails a day; stay under it so a send never stops half way
    if (emails.length > 450) {
      throw new BadRequestException(`That's ${emails.length} people. Gmail allows about 500 emails a day, so send to 450 or fewer at a time.`);
    }

    if (dto.restrictToRecipients) {
      await this.prisma.coupon.update({
        where: { id: coupon.id },
        data: { allowedEmails: Array.from(new Set([...coupon.allowedEmails, ...emails])) },
      });
    }

    const discountDisplay =
      coupon.discountType === CouponDiscountType.PERCENTAGE
        ? `${coupon.discountValue}% OFF`
        : `${(coupon.discountValue / 100).toFixed(2)} EGP OFF`;
    const template = EmailTemplates.promoCouponAnnouncement({
      locale: dto.locale === 'ar' ? 'ar' : 'en',
      couponCode: coupon.code,
      discountDisplay,
      endDateFormatted: coupon.endDate.toISOString().split('T')[0],
      customMessage: dto.customMessage,
    });

    runInBackground(
      (async () => {
        let sent = 0;
        // 5 at a time: fast enough to finish within the serverless time limit, gentle on SMTP
        for (let i = 0; i < emails.length; i += 5) {
          const results = await Promise.all(
            emails.slice(i, i + 5).map((to) =>
              this.emailService.sendMail({ to, subject: template.subject, html: template.html, text: template.text }),
            ),
          );
          sent += results.filter(Boolean).length;
        }
        this.logger.log(`Coupon ${coupon.code} emailed to ${sent}/${emails.length}`);
      })(),
      'coupon-email',
    );

    return {
      code: coupon.code,
      totalTargeted: emails.length,
      queued: emails.length,
      sentCount: emails.length,
      restrictedExclusively: Boolean(dto.restrictToRecipients),
    };
  }

  /** Checks dates, limits, the customer's own uses, allowed emails and the minimum order */
  async validateAndCalculateDiscount(dto: ValidateCouponDto, tx: Tx = this.prisma) {
    const code = dto.code.toUpperCase().trim();
    const coupon = await tx.coupon.findFirst({ where: { code, deletedAt: null } });
    if (!coupon || !coupon.isActive) throw new NotFoundException(`The code "${code}" is not valid`);

    const now = Date.now();
    if (coupon.startDate.getTime() > now) throw new BadRequestException(`The code "${code}" is not active yet`);
    if (coupon.endDate.getTime() <= now) throw new BadRequestException(`The code "${code}" has expired`);
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException(`The code "${code}" has been used up`);
    }
    const email = dto.email?.toLowerCase().trim();
    if (coupon.allowedEmails.length > 0 && (!email || !coupon.allowedEmails.includes(email))) {
      throw new ForbiddenException(`The code "${code}" is for selected customers only`);
    }
    if (coupon.perCustomerLimit !== null && email) {
      const used = await tx.couponUsage.count({ where: { couponId: coupon.id, email } });
      if (used >= coupon.perCustomerLimit) {
        throw new BadRequestException(`You already used the code "${code}"`);
      }
    }
    if (dto.subTotalCents < coupon.minOrderAmountCents) {
      throw new BadRequestException(
        `The code "${code}" needs an order of at least ${(coupon.minOrderAmountCents / 100).toFixed(2)} EGP`,
      );
    }

    let discountCents =
      coupon.discountType === CouponDiscountType.PERCENTAGE
        ? Math.round((dto.subTotalCents * coupon.discountValue) / 100)
        : coupon.discountValue;
    if (coupon.maxDiscountAmountCents && discountCents > coupon.maxDiscountAmountCents) {
      discountCents = coupon.maxDiscountAmountCents;
    }
    discountCents = Math.max(0, Math.min(discountCents, dto.subTotalCents));

    return {
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountCents,
      finalSubTotalCents: Math.max(0, dto.subTotalCents - discountCents),
    };
  }

  /**
   * Consume one use for an order, atomically. Returns false when the coupon was used up
   * meanwhile. Safe to call twice for the same order (counted once).
   */
  async claimUsage(tx: Tx, couponCode: string, orderId: string, email: string): Promise<boolean> {
    const coupon = await tx.coupon.findFirst({ where: { code: couponCode.toUpperCase().trim(), deletedAt: null } });
    if (!coupon) return false;
    const already = await tx.couponUsage.findUnique({ where: { couponId_orderId: { couponId: coupon.id, orderId } } });
    if (already) return true;
    const updated = await tx.$executeRaw`
      UPDATE coupons SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
      WHERE id = ${coupon.id} AND "isActive" = true
        AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
    if (updated === 0) return false;
    await tx.couponUsage.create({ data: { couponId: coupon.id, orderId, email: email.toLowerCase().trim() } });
    return true;
  }
}
