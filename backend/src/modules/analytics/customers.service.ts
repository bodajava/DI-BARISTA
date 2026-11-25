import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SOLD_STATUSES } from '../../common/enums';
import { SecurityService } from '../../common/services/security';
import { PrismaService } from '../../database/prisma.service';

const SOLD = Prisma.join(SOLD_STATUSES.map((s) => Prisma.sql`${s}::"OrderStatus"`));

function n(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : Number(v ?? 0) || 0;
}

/**
 * Everyone who ordered, with or without an account. A customer is identified by their user id,
 * or by the (lower-cased) email of guest orders.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  async list(search: string | undefined, page = 1, limit = 20) {
    const take = Math.min(100, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;
    const q = search?.trim() ? `%${search.trim().toLowerCase().replace(/[%_]/g, '')}%` : null;
    const filter = q
      ? Prisma.sql`HAVING bool_or(lower(o."customerName") LIKE ${q} OR lower(o."customerEmail") LIKE ${q} OR o."customerPhone" LIKE ${q})`
      : Prisma.empty;
    const base = Prisma.sql`
      SELECT COALESCE(o."userId", lower(o."customerEmail")) AS identifier,
        (array_agg(o."customerName" ORDER BY o."createdAt" DESC))[1] AS name,
        (array_agg(o."customerEmail" ORDER BY o."createdAt" DESC))[1] AS email,
        (array_agg(o."customerPhone" ORDER BY o."createdAt" DESC))[1] AS phone,
        MAX(o."userId") AS user_id,
        COUNT(*) FILTER (WHERE o.status IN (${SOLD})) AS orders,
        COALESCE(SUM(o."totalCents" - o."refundedCents") FILTER (WHERE o.status IN (${SOLD})), 0) AS spent,
        MIN(o."createdAt") AS first_order,
        MAX(o."createdAt") AS last_order
      FROM orders o WHERE o."deletedAt" IS NULL
      GROUP BY 1 ${filter}`;
    const [rows, [count]] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, unknown>>>`${base} ORDER BY last_order DESC LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<Array<{ total: unknown }>>`SELECT COUNT(*) AS total FROM (${base}) t`,
    ]);
    const userIds = rows.map((r) => r.user_id).filter(Boolean) as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, isGuest: true, loyaltyPoints: true, createdAt: true },
    });
    const docs = rows.map((r) => {
      const user = users.find((u) => u.id === r.user_id);
      return {
        identifier: String(r.identifier),
        name: String(r.name ?? ''),
        email: String(r.email ?? ''),
        phone: String(r.phone ?? ''),
        hasAccount: Boolean(user && !user.isGuest),
        since: user?.createdAt ?? (r.first_order as Date),
        orders: n(r.orders),
        spentCents: n(r.spent),
        lastOrderAt: r.last_order as Date,
        loyaltyPoints: user?.loyaltyPoints ?? 0,
      };
    });
    const total = n(count?.total);
    const totalPages = Math.ceil(total / take) || 1;
    return {
      docs,
      meta: { totalDocs: total, limit: take, page, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  async detail(identifier: string) {
    const key = identifier.trim();
    const user = key.includes('@')
      ? null
      : await this.prisma.user.findFirst({ where: { id: key }, include: { addresses: true } });
    const where: Prisma.OrderWhereInput = user
      ? { deletedAt: null, userId: user.id }
      : { deletedAt: null, userId: null, customerEmail: key.toLowerCase() };
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        totalCents: true,
        refundedCents: true,
        createdAt: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        governorate: true,
        city: true,
        street: true,
        building: true,
        floor: true,
        apartment: true,
      },
    });
    if (!user && orders.length === 0) throw new NotFoundException('No customer with these details');

    const sold = orders.filter((o) => (SOLD_STATUSES as readonly string[]).includes(o.status));
    const spent = sold.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
    const latest = orders[0];
    const phone = user?.phoneEncrypted ? safeDecrypt(this.security, user.phoneEncrypted) : latest?.customerPhone;
    return {
      identifier: user?.id ?? key.toLowerCase(),
      name: user?.fullName ?? latest?.customerName ?? '',
      email: user?.email ?? latest?.customerEmail ?? key,
      phone: phone ?? null,
      hasAccount: Boolean(user && !user.isGuest),
      since: user?.createdAt ?? orders[orders.length - 1]?.createdAt ?? null,
      lastOrderAt: latest?.createdAt ?? null,
      orders: sold.length,
      totalOrders: orders.length,
      spentCents: spent,
      averageOrderCents: sold.length ? Math.round(spent / sold.length) : 0,
      loyaltyPoints: user?.loyaltyPoints ?? 0,
      addresses: user
        ? user.addresses.map((a) => ({ ...a }))
        : latest
          ? [
              {
                id: 'last',
                governorate: latest.governorate,
                city: latest.city,
                street: latest.street,
                building: latest.building,
                floor: latest.floor,
                apartment: latest.apartment,
                isDefault: true,
              },
            ]
          : [],
      orderList: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        totalCents: o.totalCents,
        createdAt: o.createdAt,
      })),
    };
  }
}

function safeDecrypt(security: SecurityService, value: string): string | null {
  try {
    return security.decrypt(value);
  } catch {
    return null;
  }
}
