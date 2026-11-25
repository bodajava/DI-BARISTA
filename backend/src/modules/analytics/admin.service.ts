import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OrderService } from '../order/order.service';
import { SettingsService } from '../store/settings.service';
import { AnalyticsService } from './analytics.service';

/** Excel opens UTF-8 CSV with a BOM; cells starting with = + - @ would run as formulas */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly settings: SettingsService,
  ) {}

  /** "Orders to handle": the oldest five per manual stage, plus totals */
  async queue() {
    await this.orders.maybeExpireUnpaid();
    const stage = (status: OrderStatus) =>
      Promise.all([
        this.prisma.order.findMany({
          where: { deletedAt: null, status },
          orderBy: { createdAt: 'asc' },
          take: 5,
          select: { id: true, orderNumber: true, customerName: true, totalCents: true, createdAt: true, paymentMethod: true },
        }),
        this.prisma.order.count({ where: { deletedAt: null, status } }),
      ]).then(([orders, count]) => ({ status, orders, count }));
    const [toPrepare, toShip, toDeliver, waitingPayment, expiryMinutes] = await Promise.all([
      stage(OrderStatus.CONFIRMED),
      stage(OrderStatus.PREPARING),
      stage(OrderStatus.SHIPPED),
      this.prisma.order.count({ where: { deletedAt: null, status: OrderStatus.PENDING_PAYMENT } }),
      this.settings.int('orders.unpaidExpiryMinutes'),
    ]);
    return { toPrepare, toShip, toDeliver, waitingPayment, unpaidExpiryMinutes: expiryMinutes || 30 };
  }

  async exportCsv(type: 'orders' | 'products' | 'customers', fromDate?: string, toDate?: string): Promise<string> {
    const range = AnalyticsService.range({ fromDate, toDate }, 3650);
    if (type === 'products') {
      const products = await this.prisma.product.findMany({
        where: { deletedAt: null },
        include: { category: true, brand: true },
        orderBy: { name: 'asc' },
      });
      return toCsv(
        ['SKU', 'Name', 'Arabic name', 'Category', 'Brand', 'Price EGP', 'Sale price EGP', 'Cost EGP', 'Stock', 'Sold', 'Views', 'In store'],
        products.map((p) => [
          p.sku,
          p.name,
          p.nameAr,
          p.category?.name,
          p.brand?.name,
          p.priceCents / 100,
          p.discountPercent > 0 ? p.finalPriceCents / 100 : '',
          p.costCents !== null ? p.costCents / 100 : '',
          p.stock,
          p.soldCount,
          p.viewsCount,
          p.isActive ? 'yes' : 'no',
        ]),
      );
    }
    if (type === 'customers') {
      const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT COALESCE(o."userId", lower(o."customerEmail")) AS id,
          (array_agg(o."customerName" ORDER BY o."createdAt" DESC))[1] AS name,
          (array_agg(o."customerEmail" ORDER BY o."createdAt" DESC))[1] AS email,
          (array_agg(o."customerPhone" ORDER BY o."createdAt" DESC))[1] AS phone,
          COUNT(*) AS orders, SUM(o."totalCents" - o."refundedCents") AS spent, MAX(o."createdAt") AS last_order
        FROM orders o WHERE o."deletedAt" IS NULL
          AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}
        GROUP BY 1 ORDER BY spent DESC`;
      return toCsv(
        ['Name', 'Email', 'Phone', 'Orders', 'Spent EGP', 'Last order'],
        rows.map((r) => [r.name, r.email, r.phone, Number(r.orders), Number(r.spent ?? 0) / 100, r.last_order]),
      );
    }
    const where: Prisma.OrderWhereInput = { deletedAt: null, createdAt: { gte: range.from, lte: range.to } };
    const orders = await this.prisma.order.findMany({
      where,
      include: { items: { select: { quantity: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });
    return toCsv(
      ['Order', 'Date', 'Customer', 'Email', 'Phone', 'Governorate', 'City', 'Pieces', 'Subtotal EGP', 'Discount EGP', 'Delivery EGP', 'Total EGP', 'Refunded EGP', 'Payment', 'Payment status', 'Status', 'Coupon'],
      orders.map((o) => [
        o.orderNumber,
        o.createdAt,
        o.customerName,
        o.customerEmail,
        o.customerPhone,
        o.governorate,
        o.city,
        o.items.reduce((s, i) => s + i.quantity, 0),
        o.subTotalCents / 100,
        o.discountCents / 100,
        o.shippingFeeCents / 100,
        o.totalCents / 100,
        o.refundedCents / 100,
        o.paymentMethod,
        o.paymentStatus,
        o.status,
        o.couponCode,
      ]),
    );
  }
}
