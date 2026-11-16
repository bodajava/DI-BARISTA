import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PaginationQueryDto } from '../../common/dto';
import { CouponDiscountType } from '../../common/enums';
import { IPaginatedResult } from '../../common/interfaces';
import { EmailService, EmailTemplates } from '../../common/utilities/emails';
import { CouponRepository } from '../../models/repositories';
import { CouponDocument } from '../../models/schemas';
import {
  CreateCouponDto,
  SendCouponToBuyersDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto';

@Injectable()
export class CouponService {
  constructor(
    private readonly couponRepository: CouponRepository,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateCouponDto, userId: string): Promise<CouponDocument> {
    const normalizedCode = dto.code.toUpperCase().trim();
    const existing = await this.couponRepository.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictException(
        `Promo code "${normalizedCode}" already exists`,
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('Coupon endDate must be after startDate');
    }

    if (
      dto.discountType === CouponDiscountType.PERCENTAGE &&
      dto.discountValue > 90
    ) {
      throw new BadRequestException('Percentage discount cannot exceed 90%');
    }

    const allowedEmails = (dto.allowedEmails || []).map((e) =>
      e.toLowerCase().trim(),
    );

    return this.couponRepository.create({
      ...dto,
      code: normalizedCode,
      startDate,
      endDate,
      allowedEmails,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<IPaginatedResult<CouponDocument>> {
    return this.couponRepository.paginate({}, query.page, query.limit, {
      sort: query.sort,
    });
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponDocument> {
    const existing = await this.couponRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Coupon with id "${id}" not found`);
    }

    const updateFields: Record<string, unknown> = { ...dto };
    if (dto.code) {
      updateFields.code = dto.code.toUpperCase().trim();
    }
    if (dto.startDate) {
      updateFields.startDate = new Date(dto.startDate);
    }
    if (dto.endDate) {
      updateFields.endDate = new Date(dto.endDate);
    }
    if (dto.allowedEmails) {
      updateFields.allowedEmails = dto.allowedEmails.map((e) =>
        e.toLowerCase().trim(),
      );
    }

    const effectiveDiscountType = dto.discountType ?? existing.discountType;
    const effectiveDiscountValue = dto.discountValue ?? existing.discountValue;
    if (
      effectiveDiscountType === CouponDiscountType.PERCENTAGE &&
      effectiveDiscountValue > 90
    ) {
      throw new BadRequestException('Percentage discount cannot exceed 90%');
    }

    const updated = await this.couponRepository.findByIdAndUpdate(id, {
      $set: updateFields,
    });
    return updated ?? existing;
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.couponRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundException(`Coupon with id "${id}" not found`);
    }
    return { message: `Coupon "${deleted.code}" removed successfully` };
  }

  /**
   * Dispatch promo code announcement emails to targeted buyers via EmailService.sendMail()
   */
  async sendCouponToBuyers(dto: SendCouponToBuyersDto): Promise<{
    code: string;
    totalTargeted: number;
    sentCount: number;
    restrictedExclusively: boolean;
  }> {
    const normalizedCode = dto.code.toUpperCase().trim();
    const coupon = await this.couponRepository.findByCode(normalizedCode);

    if (!coupon || !coupon.isActive) {
      throw new NotFoundException(
        `Active promo code "${normalizedCode}" not found`,
      );
    }

    const normalizedEmails = Array.from(
      new Set(dto.emails.map((email) => email.toLowerCase().trim())),
    );

    if (dto.restrictToRecipients) {
      const mergedAllowed = Array.from(
        new Set([...(coupon.allowedEmails || []), ...normalizedEmails]),
      );
      await this.couponRepository.findByIdAndUpdate(coupon.id, {
        $set: { allowedEmails: mergedAllowed },
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

    let sentCount = 0;
    for (const recipientEmail of normalizedEmails) {
      const delivered = await this.emailService.sendMail({
        to: recipientEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      if (delivered) {
        sentCount += 1;
      }
    }

    return {
      code: coupon.code,
      totalTargeted: normalizedEmails.length,
      sentCount,
      restrictedExclusively: Boolean(dto.restrictToRecipients),
    };
  }

  /**
   * Validate a coupon against cart subtotal, active date window, usage limit, and allowedEmails
   */
  async validateAndCalculateDiscount(dto: ValidateCouponDto): Promise<{
    couponId: string;
    code: string;
    discountType: CouponDiscountType;
    discountValue: number;
    discountCents: number;
    finalSubTotalCents: number;
  }> {
    const normalizedCode = dto.code.toUpperCase().trim();
    const coupon = await this.couponRepository.findByCode(normalizedCode);

    if (!coupon || !coupon.isActive) {
      throw new NotFoundException(`Promo code "${normalizedCode}" is invalid`);
    }

    const now = Date.now();
    if (coupon.startDate && coupon.startDate.getTime() > now) {
      throw new BadRequestException(
        `Promo code "${normalizedCode}" is not active yet`,
      );
    }

    if (coupon.endDate && coupon.endDate.getTime() <= now) {
      throw new BadRequestException(
        `Promo code "${normalizedCode}" has expired`,
      );
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException(
        `Promo code "${normalizedCode}" has reached its usage limit`,
      );
    }

    if (coupon.allowedEmails && coupon.allowedEmails.length > 0) {
      const normalizedEmail = dto.email?.toLowerCase().trim();
      if (
        !normalizedEmail ||
        !coupon.allowedEmails.includes(normalizedEmail)
      ) {
        throw new ForbiddenException(
          `Promo code "${normalizedCode}" is exclusive to selected customers`,
        );
      }
    }

    if (dto.subTotalCents < coupon.minOrderAmountCents) {
      throw new BadRequestException(
        `Minimum order subtotal for promo code "${normalizedCode}" is ${(coupon.minOrderAmountCents / 100).toFixed(2)} EGP`,
      );
    }

    let discountCents =
      coupon.discountType === CouponDiscountType.PERCENTAGE
        ? Math.round((dto.subTotalCents * coupon.discountValue) / 100)
        : coupon.discountValue;

    if (
      coupon.maxDiscountAmountCents &&
      discountCents > coupon.maxDiscountAmountCents
    ) {
      discountCents = coupon.maxDiscountAmountCents;
    }

    discountCents = Math.min(discountCents, dto.subTotalCents);
    discountCents = Math.max(0, discountCents);

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
   * Atomically consume one use. Returns false when the usage limit was already reached
   * (the repository only increments while usedCount < usageLimit).
   */
  async incrementUsage(couponIdOrCode: string): Promise<boolean> {
    const updated = Types.ObjectId.isValid(couponIdOrCode)
      ? await this.couponRepository.incrementUsage(couponIdOrCode)
      : await this.couponRepository.incrementUsageByCode(couponIdOrCode);
    return Boolean(updated);
  }
}
