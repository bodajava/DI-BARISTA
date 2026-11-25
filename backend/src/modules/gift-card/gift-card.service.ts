import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GiftCard, GiftCardSource, GiftCardStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { runInBackground } from '../../common/utilities/background';
import { EmailService } from '../../common/utilities/emails';
import { pageArgs, paginated, PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;

export interface IssueGiftCardInput {
  amountCents: number;
  recipientEmail?: string;
  recipientName?: string;
  message?: string;
  expiresAt?: string;
  locale?: 'en' | 'ar';
}

@Injectable()
export class GiftCardService {
  static readonly MIN_CENTS = 5000;
  static readonly MAX_CENTS = 1000000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** XXXX-XXXX-XXXX from an unambiguous alphabet */
  private static newCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(12);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  }

  /** Dashboard list; codes of unpaid purchases stay hidden until they are paid */
  async list(page = 1, limit = 20) {
    const p = pageArgs(page, limit);
    const [docs, total] = await Promise.all([
      this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      this.prisma.giftCard.count(),
    ]);
    return paginated(
      docs.map((g) => ({ ...g, code: g.status === GiftCardStatus.PENDING_PAYMENT ? null : g.code })),
      total,
      p.page,
      p.limit,
    );
  }

  async issue(input: IssueGiftCardInput, userId?: string): Promise<GiftCard> {
    if (input.amountCents < GiftCardService.MIN_CENTS || input.amountCents > GiftCardService.MAX_CENTS) {
      throw new BadRequestException('A gift card is between 50 and 10,000 EGP');
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException('The expiry date must be in the future');

    let card: GiftCard | null = null;
    for (let attempt = 0; attempt < 5 && !card; attempt += 1) {
      try {
        card = await this.prisma.giftCard.create({
          data: {
            code: GiftCardService.newCode(),
            initialCents: input.amountCents,
            balanceCents: input.amountCents,
            source: GiftCardSource.ISSUED,
            status: GiftCardStatus.ACTIVE,
            recipientEmail: input.recipientEmail?.toLowerCase().trim() || null,
            recipientName: input.recipientName?.trim() || null,
            message: input.message?.trim() || null,
            expiresAt,
            createdById: userId ?? null,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    if (!card) throw new BadRequestException('Could not create a unique code, try again');

    if (card.recipientEmail) {
      runInBackground(
        this.email.sendGiftCard(card.recipientEmail, {
          code: card.code,
          amountCents: card.initialCents,
          message: card.message,
          expiresAt: card.expiresAt,
          locale: input.locale ?? 'en',
        }),
        'email',
      );
    }
    await this.audit.log(userId, 'giftcard.issue', 'gift_card', card.id, null, {
      amountCents: card.initialCents,
      recipientEmail: card.recipientEmail,
    });
    return card;
  }

  async setStatus(id: string, active: boolean, userId?: string): Promise<GiftCard> {
    const card = await this.prisma.giftCard.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('This gift card no longer exists');
    if (card.status === GiftCardStatus.PENDING_PAYMENT) {
      throw new BadRequestException('This gift card is still waiting for payment');
    }
    const updated = await this.prisma.giftCard.update({
      where: { id },
      data: { status: active ? GiftCardStatus.ACTIVE : GiftCardStatus.DISABLED },
    });
    await this.audit.log(userId, active ? 'giftcard.enable' : 'giftcard.disable', 'gift_card', id, null, null);
    return updated;
  }

  /** A usable card: active, not expired, with money on it */
  async check(code: string, tx: Tx = this.prisma): Promise<GiftCard> {
    const card = await tx.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!card || card.status !== GiftCardStatus.ACTIVE) throw new BadRequestException('This gift card is not valid');
    if (card.expiresAt && card.expiresAt.getTime() <= Date.now()) throw new BadRequestException('This gift card has expired');
    if (card.balanceCents <= 0) throw new BadRequestException('This gift card has no balance left');
    return card;
  }

  /** Take money off a card atomically; false when the balance changed meanwhile */
  async redeem(tx: Tx, code: string, amountCents: number): Promise<boolean> {
    if (amountCents <= 0) return true;
    const updated = await tx.$executeRaw`
      UPDATE gift_cards SET "balanceCents" = "balanceCents" - ${amountCents}, "updatedAt" = now()
      WHERE code = ${code.trim().toUpperCase()} AND status = 'ACTIVE' AND "balanceCents" >= ${amountCents}
        AND ("expiresAt" IS NULL OR "expiresAt" > now())`;
    return updated > 0;
  }

  async restore(tx: Tx, code: string, amountCents: number): Promise<void> {
    if (amountCents <= 0) return;
    await tx.$executeRaw`
      UPDATE gift_cards SET "balanceCents" = LEAST("initialCents", "balanceCents" + ${amountCents}), "updatedAt" = now()
      WHERE code = ${code.trim().toUpperCase()}`;
  }
}
