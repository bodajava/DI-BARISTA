import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SOLD_STATUSES } from '../../common/enums';
import { PrismaService } from '../../database/prisma.service';
import { RangeQueryDto } from './dto';

const TZ = 'Africa/Cairo';
const SOLD = Prisma.join(SOLD_STATUSES.map((s) => Prisma.sql`${s}::"OrderStatus"`));
/** createdAt is stored in UTC; buckets use the store's clock */
const LOCAL = Prisma.sql`(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})`;
const LOCAL_O = Prisma.sql`((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})`;
const CUSTOMER_KEY = Prisma.sql`COALESCE(o."userId", lower(o."customerEmail"))`;

export interface Range {
  from: Date;
  to: Date;
  days: number;
}

export type Severity = 'HIGH' | 'MEDIUM' | 'INFO';

export interface Insight {
  severity: Severity;
  type: 'VIEWS_NO_SALES' | 'FREQUENT_ISSUES' | 'STOCK_DAYS' | 'PROFITABLE_BESTSELLER';
  productId: string;
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  value?: number;
}

/** Thresholds for the insight rules */
export const INSIGHT_RULES = {
  viewsMin: 30,
  conversionBelow: 0.01,
  issuesMin: 3,
  issueRate: 0.2,
  stockCriticalDays: 3,
  stockWatchDays: 10,
  stockRateWindowDays: 14,
  bestsellerUnits: 5,
  bestsellerMargin: 0.4,
};

function n(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0) || 0;
}

/** Pure rule engine (unit-tested): rows → insights sorted HIGH → MEDIUM → INFO */
export function buildInsights(
  rows: Array<{
    productId: string;
    name: string;
    nameAr: string | null;
    isActive: boolean;
    views: number;
    units: number;
    revenueCents: number;
    costCents: number | null;
    issues: number;
    issueOrders: number;
    soldOrders: number;
    stock: number;
    recentUnits: number;
  }>,
  rules = INSIGHT_RULES,
): Insight[] {
  const out: Insight[] = [];
  for (const r of rows) {
    const ar = r.nameAr || r.name;
    const conversion = r.views > 0 ? r.units / r.views : 0;
    if (r.isActive && r.views >= rules.viewsMin && conversion < rules.conversionBelow) {
      out.push({
        severity: 'HIGH',
        type: 'VIEWS_NO_SALES',
        productId: r.productId,
        value: conversion,
        title: { en: `${r.name}: many views, few sales`, ar: `${ar}: مشاهدات كتير ومبيعات قليلة` },
        description: {
          en: `${r.views} views but ${r.units} sold. Check price, photos, description and stock.`,
          ar: `${r.views} مشاهدة و${r.units} مبيعات بس. راجع السعر والصور والوصف والمخزون.`,
        },
      });
    }
    const total = r.issueOrders + r.soldOrders;
    const issueRate = total > 0 ? r.issueOrders / total : 0;
    if (r.issues >= rules.issuesMin && issueRate >= rules.issueRate) {
      out.push({
        severity: 'HIGH',
        type: 'FREQUENT_ISSUES',
        productId: r.productId,
        value: issueRate,
        title: { en: `${r.name}: frequent refunds or cancellations`, ar: `${ar}: استرجاع أو إلغاء كتير` },
        description: {
          en: `${Math.round(issueRate * 100)}% of its orders were cancelled or refunded (${r.issues} pieces).`,
          ar: `${Math.round(issueRate * 100)}٪ من طلباته اتلغت أو اترجعت (${r.issues} قطعة).`,
        },
      });
    }
    const perDay = r.recentUnits / rules.stockRateWindowDays;
    if (r.isActive && perDay > 0) {
      const daysLeft = Math.floor(r.stock / perDay);
      if (daysLeft <= rules.stockWatchDays) {
        out.push({
          severity: daysLeft <= rules.stockCriticalDays ? 'HIGH' : 'MEDIUM',
          type: 'STOCK_DAYS',
          productId: r.productId,
          value: daysLeft,
          title: { en: `${r.name}: about ${daysLeft} days of stock left`, ar: `${ar}: المخزون يكفي حوالي ${daysLeft} يوم` },
          description: {
            en: `Selling about ${perDay.toFixed(1)} a day with ${r.stock} left. Restock soon.`,
            ar: `بيتباع حوالي ${perDay.toFixed(1)} في اليوم وفاضل ${r.stock}. اطلب كمية جديدة.`,
          },
        });
      }
    }
    if (r.isActive && r.costCents !== null && r.units >= rules.bestsellerUnits && r.revenueCents > 0) {
      const margin = (r.revenueCents - r.costCents * r.units) / r.revenueCents;
      if (margin >= rules.bestsellerMargin) {
        out.push({
          severity: 'INFO',
          type: 'PROFITABLE_BESTSELLER',
          productId: r.productId,
          value: margin,
          title: { en: `${r.name}: profitable best seller`, ar: `${ar}: من الأكثر مبيعًا وربحه عالي` },
          description: {
            en: `${r.units} sold at a ${Math.round(margin * 100)}% margin. Put it on the home page or in an email.`,
            ar: `اتباع ${r.units} بهامش ربح ${Math.round(margin * 100)}٪. حطه في الصفحة الرئيسية أو في إيميل.`,
          },
        });
      }
    }
  }
  const order: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Last N days by default; minutes rounded so cache/query keys stay stable */
  static range(query: { fromDate?: string; toDate?: string; from?: string; to?: string }, fallbackDays = 30): Range {
    const toRaw = query.toDate || query.to;
    const fromRaw = query.fromDate || query.from;
    const to = toRaw ? new Date(toRaw) : new Date();
    const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - fallbackDays * 86400000);
    to.setSeconds(59, 999);
    from.setSeconds(0, 0);
    return { from, to, days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)) };
  }

  private static previous(range: Range): Range {
    const span = range.to.getTime() - range.from.getTime();
    return { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime()), days: range.days };
  }

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  private async kpis(range: Range) {
    const [row] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COALESCE(SUM(o."totalCents" - o."refundedCents"), 0) AS revenue,
        COUNT(*) AS orders,
        COUNT(DISTINCT ${CUSTOMER_KEY}) AS customers
      FROM orders o
      WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD})
        AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}`;
    const [split] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      WITH firsts AS (
        SELECT ${CUSTOMER_KEY} AS c, MIN(o."createdAt") AS first_at
        FROM orders o WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD})
        GROUP BY 1
      ), inrange AS (
        SELECT DISTINCT ${CUSTOMER_KEY} AS c FROM orders o
        WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD})
          AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}
      )
      SELECT
        COUNT(*) FILTER (WHERE f.first_at >= ${range.from}) AS new_customers,
        COUNT(*) FILTER (WHERE f.first_at < ${range.from}) AS returning_customers
      FROM inrange i JOIN firsts f ON f.c = i.c`;
    const [visits] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT COUNT(DISTINCT "visitorId") AS visitors FROM product_views
      WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}`;
    const revenue = n(row?.revenue);
    const orders = n(row?.orders);
    const visitors = n(visits?.visitors);
    return {
      revenueCents: revenue,
      orders,
      averageOrderCents: orders ? Math.round(revenue / orders) : 0,
      customers: n(row?.customers),
      newCustomers: n(split?.new_customers),
      returningCustomers: n(split?.returning_customers),
      visitors,
      conversion: visitors > 0 ? Math.min(1, orders / visitors) : 0,
    };
  }

  /** Overview cards with the change vs the previous period of the same length */
  async overview(query: RangeQueryDto) {
    const range = AnalyticsService.range(query);
    const [current, previous] = await Promise.all([this.kpis(range), this.kpis(AnalyticsService.previous(range))]);
    const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : null) : (a - b) / b);
    return {
      range: { from: range.from, to: range.to, days: range.days },
      current,
      previous,
      change: {
        revenueCents: delta(current.revenueCents, previous.revenueCents),
        orders: delta(current.orders, previous.orders),
        averageOrderCents: delta(current.averageOrderCents, previous.averageOrderCents),
        customers: delta(current.customers, previous.customers),
        conversion: delta(current.conversion, previous.conversion),
      },
      // Legacy fields (AI analyst)
      totalRevenueCents: current.revenueCents,
      totalRevenueFormatted: `${(current.revenueCents / 100).toFixed(2)} EGP`,
      paidOrdersCount: current.orders,
      totalOrdersCount: current.orders,
      averageOrderValueCents: current.averageOrderCents,
      averageOrderValueFormatted: `${(current.averageOrderCents / 100).toFixed(2)} EGP`,
      uniqueCustomersCount: current.customers,
    };
  }

  // ---------------------------------------------------------------------------
  // Trend & breakdowns
  // ---------------------------------------------------------------------------

  async salesTrend(query: RangeQueryDto) {
    const range = AnalyticsService.range(query);
    const granularity =
      query.granularity && query.granularity !== 'auto'
        ? query.granularity
        : range.days <= 31
          ? 'day'
          : range.days <= 120
            ? 'week'
            : 'month';
    const unit = Prisma.raw(`'${granularity}'`);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; revenue: unknown; orders: unknown }>>`
      SELECT date_trunc(${unit}, ${LOCAL}) AS bucket,
        COALESCE(SUM("totalCents" - "refundedCents"), 0) AS revenue,
        COUNT(*) AS orders
      FROM orders
      WHERE "deletedAt" IS NULL AND status IN (${SOLD})
        AND "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
      GROUP BY 1 ORDER BY 1`;
    return {
      granularity,
      points: rows.map((r) => ({
        bucket: r.bucket.toISOString().slice(0, 10),
        revenueCents: n(r.revenue),
        orders: n(r.orders),
      })),
    };
  }

  async breakdown(query: RangeQueryDto) {
    const range = AnalyticsService.range(query);
    const inRange = Prisma.sql`o."deletedAt" IS NULL AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}`;
    const [byStatus, byMethod, byCategory, byGovernorate, byWeekday] = await Promise.all([
      this.prisma.$queryRaw<Array<{ key: string; orders: unknown; cents: unknown }>>`
        SELECT o.status::text AS key, COUNT(*) AS orders, COALESCE(SUM(o."totalCents"), 0) AS cents
        FROM orders o WHERE ${inRange} GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<Array<{ key: string; orders: unknown; cents: unknown }>>`
        SELECT o."paymentMethod"::text AS key, COUNT(*) AS orders, COALESCE(SUM(o."totalCents" - o."refundedCents"), 0) AS cents
        FROM orders o WHERE ${inRange} AND o.status IN (${SOLD}) GROUP BY 1 ORDER BY 3 DESC`,
      this.prisma.$queryRaw<Array<{ key: string; key_ar: string | null; orders: unknown; cents: unknown }>>`
        SELECT COALESCE(c.name, 'Other') AS key, c."nameAr" AS key_ar, COUNT(DISTINCT o.id) AS orders,
          COALESCE(SUM(i."lineTotalCents"), 0) AS cents
        FROM order_items i
        JOIN orders o ON o.id = i."orderId"
        LEFT JOIN products p ON p.id = i."productId"
        LEFT JOIN categories c ON c.id = p."categoryId"
        WHERE ${inRange} AND o.status IN (${SOLD})
        GROUP BY 1, 2 ORDER BY 4 DESC`,
      this.prisma.$queryRaw<Array<{ key: string; orders: unknown; cents: unknown }>>`
        SELECT COALESCE(o.governorate, o.city) AS key, COUNT(*) AS orders, COALESCE(SUM(o."totalCents" - o."refundedCents"), 0) AS cents
        FROM orders o WHERE ${inRange} AND o.status IN (${SOLD}) GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      this.prisma.$queryRaw<Array<{ key: unknown; orders: unknown; cents: unknown }>>`
        SELECT EXTRACT(ISODOW FROM ${LOCAL_O}) AS key, COUNT(*) AS orders, COALESCE(SUM(o."totalCents" - o."refundedCents"), 0) AS cents
        FROM orders o WHERE ${inRange} AND o.status IN (${SOLD}) GROUP BY 1 ORDER BY 1`,
    ]);
    const shape = (rows: Array<{ key: unknown; orders: unknown; cents: unknown; key_ar?: string | null }>) => {
      const total = rows.reduce((s, r) => s + n(r.cents), 0);
      return rows.map((r) => ({
        key: String(r.key),
        ...(r.key_ar !== undefined ? { keyAr: r.key_ar } : {}),
        orders: n(r.orders),
        cents: n(r.cents),
        share: total > 0 ? n(r.cents) / total : 0,
      }));
    };
    return {
      byStatus: shape(byStatus),
      byMethod: shape(byMethod),
      byCategory: shape(byCategory),
      byGovernorate: shape(byGovernorate),
      byWeekday: shape(byWeekday),
    };
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  async customers(query: RangeQueryDto) {
    const range = AnalyticsService.range(query);
    const kpi = await this.kpis(range);
    const [repeat] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT COUNT(*) FILTER (WHERE cnt >= 2) AS repeaters, COUNT(*) AS total
      FROM (
        SELECT ${CUSTOMER_KEY} AS c, COUNT(*) AS cnt FROM orders o
        WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD}) GROUP BY 1
      ) t`;
    const [guests] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT COUNT(*) FILTER (WHERE o."userId" IS NULL) AS guest_orders, COUNT(*) AS orders
      FROM orders o WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD})
        AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}`;
    const top = await this.topCustomers(range, query.limit ?? 10);
    return {
      newCustomers: kpi.newCustomers,
      returningCustomers: kpi.returningCustomers,
      repeatRate: n(repeat?.total) ? n(repeat?.repeaters) / n(repeat?.total) : 0,
      guestShare: n(guests?.orders) ? n(guests?.guest_orders) / n(guests?.orders) : 0,
      top,
    };
  }

  async topCustomers(range: Range | null, limit = 10) {
    const where = range
      ? Prisma.sql`AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ${CUSTOMER_KEY} AS identifier,
        (array_agg(o."customerName" ORDER BY o."createdAt" DESC))[1] AS name,
        (array_agg(o."customerEmail" ORDER BY o."createdAt" DESC))[1] AS email,
        bool_or(o."userId" IS NOT NULL) AS has_account,
        COUNT(*) AS orders,
        COALESCE(SUM(o."totalCents" - o."refundedCents"), 0) AS spent,
        MAX(o."createdAt") AS last_order
      FROM orders o
      WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD}) ${where}
      GROUP BY 1 ORDER BY spent DESC LIMIT ${Math.min(100, Math.max(1, limit))}`;
    return rows.map((r) => ({
      identifier: String(r.identifier),
      name: String(r.name ?? ''),
      email: String(r.email ?? ''),
      hasAccount: Boolean(r.has_account),
      orders: n(r.orders),
      spentCents: n(r.spent),
      lastOrderAt: r.last_order as Date,
    }));
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  private async productRows(range: Range) {
    const recentFrom = new Date(Date.now() - INSIGHT_RULES.stockRateWindowDays * 86400000);
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      WITH sold AS (
        SELECT i."productId" AS pid, SUM(i.quantity) AS units, SUM(i."lineTotalCents") AS revenue,
          SUM(COALESCE(i."costCents", p."costCents", 0) * i.quantity) AS cost,
          bool_and(COALESCE(i."costCents", p."costCents") IS NOT NULL) AS has_cost,
          COUNT(DISTINCT o.id) AS sold_orders
        FROM order_items i JOIN orders o ON o.id = i."orderId" LEFT JOIN products p ON p.id = i."productId"
        WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD})
          AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}
        GROUP BY 1
      ), issues AS (
        SELECT i."productId" AS pid, SUM(i.quantity) AS pieces, COUNT(DISTINCT o.id) AS issue_orders
        FROM order_items i JOIN orders o ON o.id = i."orderId"
        WHERE o."deletedAt" IS NULL AND o.status IN ('CANCELLED'::"OrderStatus", 'REFUNDED'::"OrderStatus")
          AND o."cancelReason" IS DISTINCT FROM 'Not paid in time'
          AND o."createdAt" >= ${range.from} AND o."createdAt" <= ${range.to}
        GROUP BY 1
      ), views AS (
        SELECT "productId" AS pid, COUNT(*) AS views FROM product_views
        WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to} GROUP BY 1
      ), recent AS (
        SELECT i."productId" AS pid, SUM(i.quantity) AS units
        FROM order_items i JOIN orders o ON o.id = i."orderId"
        WHERE o."deletedAt" IS NULL AND o.status IN (${SOLD}) AND o."createdAt" >= ${recentFrom}
        GROUP BY 1
      )
      SELECT p.id, p.name, p."nameAr", p.sku, p."imageUrls"[1] AS image, p.stock, p."isActive",
        p."deletedAt" IS NOT NULL AS deleted, p."costCents",
        COALESCE(v.views, 0) AS views, COALESCE(s.units, 0) AS units, COALESCE(s.revenue, 0) AS revenue,
        COALESCE(s.cost, 0) AS cost, COALESCE(s.has_cost, p."costCents" IS NOT NULL) AS has_cost,
        COALESCE(s.sold_orders, 0) AS sold_orders,
        COALESCE(x.pieces, 0) AS issues, COALESCE(x.issue_orders, 0) AS issue_orders,
        COALESCE(r.units, 0) AS recent_units
      FROM products p
      LEFT JOIN sold s ON s.pid = p.id
      LEFT JOIN issues x ON x.pid = p.id
      LEFT JOIN views v ON v.pid = p.id
      LEFT JOIN recent r ON r.pid = p.id
      WHERE p."deletedAt" IS NULL OR s.units IS NOT NULL`;
  }

  async productsPerformance(query: RangeQueryDto) {
    const range = AnalyticsService.range(query);
    const rows = (await this.productRows(range)).map((r) => {
      const views = n(r.views);
      const units = n(r.units);
      const revenue = n(r.revenue);
      return {
        productId: String(r.id),
        name: String(r.name),
        nameAr: (r.nameAr as string) ?? null,
        sku: String(r.sku),
        imageUrl: (r.image as string) ?? null,
        views,
        sold: units,
        conversion: views > 0 ? units / views : 0,
        revenueCents: revenue,
        profitCents: r.has_cost ? revenue - n(r.cost) : null,
        rating: null as number | null,
        returns: n(r.issues),
        stock: n(r.stock),
        hidden: !r.isActive,
        deleted: Boolean(r.deleted),
      };
    });
    const sortBy = query.sortBy ?? 'revenue';
    const key: Record<string, (x: (typeof rows)[number]) => number> = {
      revenue: (x) => x.revenueCents,
      sold: (x) => x.sold,
      conversion: (x) => x.conversion,
      views: (x) => x.views,
      returns: (x) => x.returns,
    };
    const pick = key[sortBy] ?? key.revenue;
    const dir = query.order === 'asc' ? 1 : -1;
    rows.sort((a, b) => (pick(a) - pick(b)) * dir || a.name.localeCompare(b.name));
    return rows.slice(0, Math.min(500, query.limit ?? 200));
  }

  /** Best sellers of the period (only products with sales) */
  async topProducts(query: RangeQueryDto) {
    const rows = await this.productsPerformance({ ...query, sortBy: 'revenue', order: 'desc', limit: 500 });
    return rows.filter((r) => r.sold > 0).slice(0, query.limit ?? 8);
  }

  async insights(query: RangeQueryDto) {
    const range = AnalyticsService.range(query);
    const rows = await this.productRows(range);
    return buildInsights(
      rows
        .filter((r) => !r.deleted)
        .map((r) => ({
          productId: String(r.id),
          name: String(r.name),
          nameAr: (r.nameAr as string) ?? null,
          isActive: Boolean(r.isActive),
          views: n(r.views),
          units: n(r.units),
          revenueCents: n(r.revenue),
          costCents: r.has_cost && n(r.units) > 0 ? Math.round(n(r.cost) / n(r.units)) : null,
          issues: n(r.issues),
          issueOrders: n(r.issue_orders),
          soldOrders: n(r.sold_orders),
          stock: n(r.stock),
          recentUnits: n(r.recent_units),
        })),
    ).slice(0, query.limit ?? 5);
  }

  // ---------------------------------------------------------------------------
  // Legacy shapes used by the AI analyst
  // ---------------------------------------------------------------------------

  getOverviewKpis(query: { from?: string; to?: string } = {}) {
    return this.overview({ fromDate: query.from, toDate: query.to } as RangeQueryDto);
  }

  async getProductsPerformance() {
    const rows = await this.productsPerformance({ limit: 500 } as RangeQueryDto);
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { name: true, sku: true, viewsCount: true, soldCount: true, finalPriceCents: true },
    });
    return {
      winnerProducts: rows
        .filter((r) => r.sold > 0)
        .slice(0, 5)
        .map((r) => ({ name: r.name, sku: r.sku, totalQuantitySold: r.sold, totalRevenueCents: r.revenueCents })),
      loserHighDropOffProducts: products
        .filter((p) => p.viewsCount >= 10)
        .map((p) => ({ ...p, dropOffRatio: 1 - Math.min(1, p.soldCount / Math.max(1, p.viewsCount)) }))
        .sort((a, b) => b.dropOffRatio - a.dropOffRatio)
        .slice(0, 5),
    };
  }

  async getCustomersDirectory() {
    const top = await this.topCustomers(null, 100);
    return {
      summary: {
        repeatBuyersCount: top.filter((c) => c.orders >= 2).length,
        oneTimeBuyersCount: top.filter((c) => c.orders === 1).length,
      },
      buyers: top.map((c) => ({
        email: c.email,
        customerName: c.name,
        totalOrdersCount: c.orders,
        totalSpendCents: c.spentCents,
        lastOrderDate: c.lastOrderAt,
      })),
    };
  }
}
