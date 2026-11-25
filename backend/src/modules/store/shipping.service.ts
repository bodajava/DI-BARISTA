import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ShippingZone } from '@prisma/client';
import { isUniqueViolation, PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GOVERNORATES } from './governorates';
import { SettingsService } from './settings.service';

export interface ShippingQuote {
  governorate: string;
  feeCents: number;
  days: string;
  free: boolean;
}

@Injectable()
export class ShippingService implements OnModuleInit {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** First run: one active zone per governorate at the default fee, so checkout works right away */
  async onModuleInit(): Promise<void> {
    try {
      if ((await this.prisma.shippingZone.count()) > 0) return;
      await this.prisma.shippingZone.createMany({
        data: GOVERNORATES.map((g) => ({
          governorate: g.en,
          nameEn: g.en,
          nameAr: g.ar,
          feeCents: ['Cairo', 'Giza'].includes(g.en) ? 5000 : 7500,
          days: ['Cairo', 'Giza'].includes(g.en) ? '1-2' : '2-4',
        })),
        skipDuplicates: true,
      });
      this.logger.log('Created delivery zones for the 27 governorates');
    } catch (error) {
      this.logger.warn(`Delivery zones not seeded: ${(error as Error).message}`);
    }
  }

  list(activeOnly = false): Promise<ShippingZone[]> {
    return this.prisma.shippingZone.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { nameEn: 'asc' },
    });
  }

  /** Delivery fee for an order; throws when the governorate has no active zone */
  async quote(governorate: string | undefined | null, subTotalCents: number): Promise<ShippingQuote> {
    const key = (governorate || '').trim();
    const zone = key
      ? await this.prisma.shippingZone.findFirst({
          where: { isActive: true, OR: [{ governorate: { equals: key, mode: 'insensitive' } }, { nameAr: key }] },
        })
      : null;
    if (!zone) {
      throw new BadRequestException(
        key ? `We don't deliver to ${key} yet` : 'Choose the governorate to deliver to',
      );
    }
    const threshold = await this.settings.int('shipping.freeThresholdCents');
    const free = threshold > 0 && subTotalCents >= threshold;
    return { governorate: zone.governorate, feeCents: free ? 0 : zone.feeCents, days: zone.days, free };
  }

  async create(dto: { governorate: string; nameEn?: string; nameAr?: string; feeCents: number; days?: string; isActive?: boolean }, userId?: string) {
    const known = GOVERNORATES.find((g) => g.en.toLowerCase() === dto.governorate.trim().toLowerCase());
    try {
      const zone = await this.prisma.shippingZone.create({
        data: {
          governorate: known?.en ?? dto.governorate.trim(),
          nameEn: dto.nameEn?.trim() || known?.en || dto.governorate.trim(),
          nameAr: dto.nameAr?.trim() || known?.ar || dto.governorate.trim(),
          feeCents: dto.feeCents,
          days: dto.days?.trim() || '2-3',
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.log(userId, 'zone.create', 'shipping_zone', zone.id, null, zone);
      return zone;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This governorate already has a delivery zone');
      throw error;
    }
  }

  async update(id: string, dto: Partial<{ nameEn: string; nameAr: string; feeCents: number; days: string; isActive: boolean }>, userId?: string) {
    const existing = await this.prisma.shippingZone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('This delivery zone no longer exists');
    const zone = await this.prisma.shippingZone.update({ where: { id }, data: dto });
    await this.audit.log(userId, 'zone.update', 'shipping_zone', id, existing, zone);
    return zone;
  }

  async remove(id: string, userId?: string) {
    const existing = await this.prisma.shippingZone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('This delivery zone no longer exists');
    await this.prisma.shippingZone.delete({ where: { id } });
    await this.audit.log(userId, 'zone.delete', 'shipping_zone', id, existing, null);
    return { message: `Delivery to ${existing.nameEn} removed` };
  }
}
