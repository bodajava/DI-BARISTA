import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';
import { randomBytes, randomInt } from 'crypto';
import { Public, RateLimit } from '../../common/decorators';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { runInBackground } from '../../common/utilities/background';
import { assertDeliverableEmail } from '../../common/utilities/email';
import { EmailService, EmailTemplates } from '../../common/utilities/emails';
import { PrismaService } from '../../database/prisma.service';
import { WheelConfig } from '../store/settings.definitions';
import { SettingsService } from '../store/settings.service';

class SpinDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({ require_tld: true })
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

/** Picks a slice by weight; a "chosen winner" email always gets its slice */
export function pickSlice(config: WheelConfig, email: string, random: (max: number) => number = randomInt): number {
  const chosen = config.chosenWinners.find((w) => w.email === email.toLowerCase());
  if (chosen) return chosen.sliceIndex;
  const total = config.slices.reduce((s, x) => s + Math.max(0, x.weight), 0);
  let roll = random(total);
  for (let i = 0; i < config.slices.length; i += 1) {
    roll -= Math.max(0, config.slices[i].weight);
    if (roll < 0) return i;
  }
  return config.slices.length - 1;
}

@Injectable()
export class WheelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
  ) {}

  private running(config: WheelConfig): boolean {
    const now = Date.now();
    return (
      config.enabled &&
      (!config.startsAt || new Date(config.startsAt).getTime() <= now) &&
      (!config.endsAt || new Date(config.endsAt).getTime() > now)
    );
  }

  /** Public view: labels only (never weights or chosen winners) */
  async publicView() {
    const config = await this.settings.get<WheelConfig>('wheel');
    if (!this.running(config)) return { enabled: false };
    return {
      enabled: true,
      round: config.round,
      popupDelaySeconds: config.popupDelaySeconds,
      slices: config.slices.map((s) => ({ labelEn: s.labelEn, labelAr: s.labelAr })),
    };
  }

  async spin(emailAddress: string, locale: 'en' | 'ar' = 'en') {
    const config = await this.settings.get<WheelConfig>('wheel');
    if (!this.running(config)) throw new BadRequestException('The wheel is not running right now');
    await assertDeliverableEmail(emailAddress);

    const sliceIndex = pickSlice(config, emailAddress);
    const slice = config.slices[sliceIndex];
    let couponCode: string | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.wheelSpin.create({ data: { email: emailAddress, round: config.round, sliceIndex } });
        if (slice.prize !== 'none') {
          couponCode = `WIN-${randomBytes(4).toString('hex').toUpperCase()}`;
          const start = new Date();
          await tx.coupon.create({
            data: {
              code: couponCode,
              note: `Prize wheel round ${config.round}`,
              discountType: slice.prize === 'percent' ? CouponDiscountType.PERCENTAGE : CouponDiscountType.FIXED_AMOUNT,
              discountValue: slice.value,
              minOrderAmountCents: config.minOrderCents,
              startDate: start,
              endDate: new Date(start.getTime() + config.codeValidityDays * 86400000),
              usageLimit: 1,
              perCustomerLimit: 1,
              allowedEmails: [emailAddress],
              source: 'WHEEL',
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('This email already spun the wheel this round');
      }
      throw error;
    }

    if (couponCode) {
      const discountDisplay = slice.prize === 'percent' ? `${slice.value}% OFF` : `${(slice.value / 100).toFixed(0)} EGP OFF`;
      const template = EmailTemplates.promoCouponAnnouncement({
        locale,
        couponCode,
        discountDisplay,
        endDateFormatted: new Date(Date.now() + config.codeValidityDays * 86400000).toISOString().slice(0, 10),
      });
      runInBackground(this.email.sendMail({ to: emailAddress, ...template }), 'email');
    }
    return { sliceIndex, won: Boolean(couponCode), couponCode, label: { en: slice.labelEn, ar: slice.labelAr } };
  }
}

@Controller('wheel')
@UseGuards(AuthGuard, RolesGuard)
export class WheelController {
  constructor(private readonly wheel: WheelService) {}

  @Public()
  @Get()
  view() {
    return this.wheel.publicView();
  }

  @Public()
  @Post('spin')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 10 * 60 })
  spin(@Body() dto: SpinDto) {
    return this.wheel.spin(dto.email, dto.locale);
  }
}

@Module({
  controllers: [WheelController],
  providers: [WheelService],
})
export class WheelModule {}
