import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { OrderStatus, PaymentStatus } from '../../common/enums';
import {
  ContactMessage,
  ContactMessageDocument,
  Order,
  OrderDocument,
  Product,
  ProductDocument,
  Subscriber,
  SubscriberDocument,
} from '../../models/schemas';
import { OverviewAnalyticsQueryDto, SalesTrendQueryDto } from './dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: Model<SubscriberDocument>,
    @InjectModel(ContactMessage.name)
    private readonly contactMessageModel: Model<ContactMessageDocument>,
  ) {}

  /**
   * Endpoint 1: Overview KPIs (GET /api/v1/admin/analytics/overview?from=...&to=...)
   */
  async getOverviewKpis(query: OverviewAnalyticsQueryDto) {
    const matchStage: FilterQuery<OrderDocument> = { deletedAt: null };
    if (query.from || query.to) {
      const createdAtFilter: Record<string, Date> = {};
      if (query.from) createdAtFilter.$gte = new Date(query.from);
      if (query.to) createdAtFilter.$lte = new Date(query.to);
      (matchStage as Record<string, unknown>).createdAt = createdAtFilter;
    }

    const [facetResult] = await this.orderModel
      .aggregate([
        { $match: matchStage },
        {
          $facet: {
            revenueStats: [
              {
                $match: {
                  $or: [
                    { status: { $in: [OrderStatus.PAID, OrderStatus.DELIVERED] } },
                    { paymentStatus: PaymentStatus.SUCCESS },
                  ],
                },
              },
              {
                $group: {
                  _id: null,
                  totalRevenueCents: { $sum: '$totalCents' },
                  paidOrdersCount: { $sum: 1 },
                  averageOrderValueCents: { $avg: '$totalCents' },
                },
              },
            ],
            totalOrdersCount: [{ $count: 'count' }],
            statusBreakdown: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  totalCents: { $sum: '$totalCents' },
                },
              },
            ],
            uniqueCustomers: [
              {
                $group: {
                  _id: '$customerEmail',
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ])
      .exec();

    const rev = facetResult?.revenueStats?.[0] || {
      totalRevenueCents: 0,
      paidOrdersCount: 0,
      averageOrderValueCents: 0,
    };

    const totalOrders = facetResult?.totalOrdersCount?.[0]?.count ?? 0;
    const uniqueCustomersCount = facetResult?.uniqueCustomers?.[0]?.count ?? 0;

    return {
      totalRevenueCents: rev.totalRevenueCents,
      totalRevenueFormatted: `${(rev.totalRevenueCents / 100).toFixed(2)} EGP`,
      paidOrdersCount: rev.paidOrdersCount,
      totalOrdersCount: totalOrders,
      averageOrderValueCents: Math.round(rev.averageOrderValueCents || 0),
      averageOrderValueFormatted: `${(
        Math.round(rev.averageOrderValueCents || 0) / 100
      ).toFixed(2)} EGP`,
      uniqueCustomersCount,
      ordersByStatus: (facetResult?.statusBreakdown || []).map(
        (s: { _id: string; count: number; totalCents: number }) => ({
          status: s._id,
          count: s.count,
          totalCents: s.totalCents,
        }),
      ),
    };
  }

  /**
   * Endpoint 2: Winner & Loser Coffee Products (GET /api/v1/admin/analytics/products-performance)
   */
  async getProductsPerformance() {
    const [winnerProductsFromOrders, loserDropOffProducts] = await Promise.all([
      this.orderModel
        .aggregate([
          {
            $match: {
              deletedAt: null,
              status: { $ne: OrderStatus.CANCELLED },
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              sku: { $first: '$items.sku' },
              name: { $first: '$items.name' },
              totalQuantitySold: { $sum: '$items.quantity' },
              totalRevenueCents: { $sum: '$items.lineTotalCents' },
              ordersCount: { $sum: 1 },
            },
          },
          { $sort: { totalQuantitySold: -1, totalRevenueCents: -1 } },
          { $limit: 5 },
        ])
        .exec(),

      this.productModel
        .aggregate([
          {
            $match: {
              deletedAt: null,
              isActive: true,
            },
          },
          {
            $addFields: {
              dropOffRatio: {
                $divide: [
                  { $ifNull: ['$viewsCount', 0] },
                  { $add: [{ $ifNull: ['$soldCount', 0] }, 1] },
                ],
              },
            },
          },
          { $sort: { dropOffRatio: -1, viewsCount: -1, soldCount: 1 } },
          { $limit: 5 },
          {
            $project: {
              _id: 1,
              name: 1,
              nameAr: 1,
              sku: 1,
              slug: 1,
              roastLevel: 1,
              priceCents: 1,
              finalPriceCents: 1,
              stock: 1,
              viewsCount: 1,
              soldCount: 1,
              dropOffRatio: { $round: ['$dropOffRatio', 2] },
            },
          },
        ])
        .exec(),
    ]);

    return {
      winnerProducts: winnerProductsFromOrders,
      loserHighDropOffProducts: loserDropOffProducts,
    };
  }

  /**
   * Endpoint 3: Customer Behavior & Buyer Directory (GET /api/v1/admin/analytics/customers)
   */
  async getCustomersDirectory() {
    const buyers = await this.orderModel
      .aggregate([
        {
          $match: {
            deletedAt: null,
            status: { $ne: OrderStatus.CANCELLED },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$customerEmail',
            customerName: { $first: '$customerName' },
            customerPhone: { $first: '$customerPhone' },
            totalOrdersCount: { $sum: 1 },
            totalSpendCents: { $sum: '$totalCents' },
            avgOrderValueCents: { $avg: '$totalCents' },
            lastOrderDate: { $max: '$createdAt' },
            firstOrderDate: { $min: '$createdAt' },
          },
        },
        {
          $addFields: {
            buyerType: {
              $cond: [
                { $gt: ['$totalOrdersCount', 1] },
                'REPEAT_BUYER',
                'ONE_TIME_BUYER',
              ],
            },
          },
        },
        { $sort: { totalSpendCents: -1, totalOrdersCount: -1 } },
      ])
      .exec();

    const formattedBuyers = buyers.map((b) => ({
      email: b._id as string,
      customerName: b.customerName as string,
      customerPhone: b.customerPhone as string,
      buyerType: b.buyerType as 'REPEAT_BUYER' | 'ONE_TIME_BUYER',
      totalOrdersCount: b.totalOrdersCount as number,
      totalSpendCents: b.totalSpendCents as number,
      totalSpendFormatted: `${((b.totalSpendCents as number) / 100).toFixed(2)} EGP`,
      avgOrderValueCents: Math.round((b.avgOrderValueCents as number) || 0),
      firstOrderDate: b.firstOrderDate as Date,
      lastOrderDate: b.lastOrderDate as Date,
    }));

    const repeatBuyerEmails = formattedBuyers
      .filter((b) => b.buyerType === 'REPEAT_BUYER')
      .map((b) => b.email);

    const oneTimeBuyerEmails = formattedBuyers
      .filter((b) => b.buyerType === 'ONE_TIME_BUYER')
      .map((b) => b.email);

    const allBuyerEmails = formattedBuyers.map((b) => b.email);

    return {
      summary: {
        totalDistinctBuyers: formattedBuyers.length,
        repeatBuyersCount: repeatBuyerEmails.length,
        oneTimeBuyersCount: oneTimeBuyerEmails.length,
      },
      promoTargetingLists: {
        allBuyerEmails,
        repeatBuyerEmails,
        oneTimeBuyerEmails,
      },
      buyers: formattedBuyers,
    };
  }

  /**
   * Endpoint 4: Sales Over Time (GET /api/v1/admin/analytics/sales-trend?interval=day|week|month)
   */
  async getSalesTrend(query: SalesTrendQueryDto) {
    const interval = query.interval || 'day';
    const dateFormat =
      interval === 'month'
        ? '%Y-%m'
        : interval === 'week'
          ? '%G-W%V'
          : '%Y-%m-%d';

    const matchStage: FilterQuery<OrderDocument> = {
      deletedAt: null,
      status: { $ne: OrderStatus.CANCELLED },
    };

    if (query.from || query.to) {
      const createdAtFilter: Record<string, Date> = {};
      if (query.from) createdAtFilter.$gte = new Date(query.from);
      if (query.to) createdAtFilter.$lte = new Date(query.to);
      (matchStage as Record<string, unknown>).createdAt = createdAtFilter;
    }

    const trend = await this.orderModel
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: dateFormat, date: '$createdAt' },
            },
            ordersCount: { $sum: 1 },
            revenueCents: { $sum: '$totalCents' },
            discountCents: { $sum: '$discountCents' },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    return {
      interval,
      series: trend.map((point) => ({
        period: point._id as string,
        ordersCount: point.ordersCount as number,
        revenueCents: point.revenueCents as number,
        revenueFormatted: `${((point.revenueCents as number) / 100).toFixed(2)} EGP`,
        discountCents: (point.discountCents as number) || 0,
      })),
    };
  }

  /**
   * Endpoint 5: Business insights for the dashboard (GET /api/v1/admin/analytics/insights)
   * "Valid" orders exclude cancelled, refunded and abandoned online checkouts. Times use Cairo.
   */
  async getBusinessInsights() {
    const TZ = 'Africa/Cairo';
    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    // Midnight in Cairo, expressed as a real instant (server may run in UTC)
    const cairoNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    const offsetMs = cairoNow.getTime() - now.getTime();
    const cairoMidnight = new Date(cairoNow);
    cairoMidnight.setHours(0, 0, 0, 0);
    const startToday = new Date(cairoMidnight.getTime() - offsetMs);
    const startYesterday = new Date(startToday.getTime() - DAY);
    const start30 = new Date(now.getTime() - 30 * DAY);
    const start60 = new Date(now.getTime() - 60 * DAY);

    const valid = {
      deletedAt: null,
      status: {
        $nin: [OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.PENDING_PAYMENT],
      },
    };
    const sumOf = (from: Date, to?: Date) => [
      { $match: { createdAt: { $gte: from, ...(to ? { $lt: to } : {}) } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenueCents: { $sum: '$totalCents' } } },
    ];

    const [orderFacets] = await this.orderModel
      .aggregate([
        { $match: valid },
        {
          $facet: {
            today: sumOf(startToday),
            yesterday: sumOf(startYesterday, startToday),
            last30: sumOf(start30),
            prev30: sumOf(start60, start30),
            byPayment: [
              { $group: { _id: '$paymentMethod', orders: { $sum: 1 }, revenueCents: { $sum: '$totalCents' } } },
              { $sort: { revenueCents: -1 } },
            ],
            byCity: [
              { $group: { _id: '$shippingAddress.city', orders: { $sum: 1 }, revenueCents: { $sum: '$totalCents' } } },
              { $sort: { orders: -1 } },
              { $limit: 8 },
            ],
            byHour: [
              { $group: { _id: { $hour: { date: '$createdAt', timezone: TZ } }, orders: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            byWeekday: [
              { $group: { _id: { $dayOfWeek: { date: '$createdAt', timezone: TZ } }, orders: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            basket: [
              { $project: { units: { $sum: '$items.quantity' }, discountCents: 1, couponCode: 1 } },
              {
                $group: {
                  _id: null,
                  avgUnits: { $avg: '$units' },
                  discountCents: { $sum: '$discountCents' },
                  couponOrders: { $sum: { $cond: [{ $ifNull: ['$couponCode', false] }, 1, 0] } },
                },
              },
            ],
            customers: [
              { $group: { _id: { $toLower: '$customerEmail' }, orders: { $sum: 1 } } },
              {
                $group: {
                  _id: null,
                  customers: { $sum: 1 },
                  repeat: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } },
                },
              },
            ],
            openFulfilment: [
              {
                $match: {
                  status: {
                    $in: [
                      OrderStatus.PAID,
                      OrderStatus.PROCESSING,
                      OrderStatus.CONFIRMED,
                      OrderStatus.ROASTING,
                      OrderStatus.ROASTING_AND_PREPARING,
                      OrderStatus.PACKING,
                    ],
                  },
                },
              },
              { $count: 'count' },
            ],
            byCategory: [
              { $unwind: '$items' },
              { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } },
              { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
              { $lookup: { from: 'categories', localField: 'p.categoryId', foreignField: '_id', as: 'c' } },
              { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
              {
                $group: {
                  _id: { $ifNull: ['$c.name', 'Other'] },
                  nameAr: { $first: '$c.nameAr' },
                  units: { $sum: '$items.quantity' },
                  revenueCents: { $sum: '$items.lineTotalCents' },
                },
              },
              { $sort: { revenueCents: -1 } },
            ],
          },
        },
      ])
      .exec();

    const [cancelStats] = await this.orderModel
      .aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: start30 } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            cancelled: {
              $sum: {
                $cond: [{ $in: ['$status', [OrderStatus.CANCELLED, OrderStatus.REFUNDED]] }, 1, 0],
              },
            },
            abandonedOnline: {
              $sum: { $cond: [{ $eq: ['$status', OrderStatus.PENDING_PAYMENT] }, 1, 0] },
            },
          },
        },
      ])
      .exec();

    const [lowStock, subscribersTotal, subscribers30, messagesNew] = await Promise.all([
      this.productModel
        .find({ deletedAt: null, isActive: true, stock: { $lte: 10 } })
        .select('name nameAr sku stock slug')
        .sort({ stock: 1 })
        .limit(10)
        .lean()
        .exec(),
      this.subscriberModel.countDocuments({ deletedAt: null, isActive: true }).exec(),
      this.subscriberModel
        .countDocuments({ deletedAt: null, isActive: true, createdAt: { $gte: start30 } })
        .exec(),
      this.contactMessageModel.countDocuments({ deletedAt: null, status: 'NEW' }).exec(),
    ]);

    const pick = (arr?: Array<{ orders: number; revenueCents: number }>) => ({
      orders: arr?.[0]?.orders ?? 0,
      revenueCents: arr?.[0]?.revenueCents ?? 0,
    });
    const basket = orderFacets?.basket?.[0];
    const customers = orderFacets?.customers?.[0];
    const validCount = (orderFacets?.byPayment ?? []).reduce(
      (n: number, r: { orders: number }) => n + r.orders,
      0,
    );

    return {
      generatedAt: now.toISOString(),
      today: pick(orderFacets?.today),
      yesterday: pick(orderFacets?.yesterday),
      last30: pick(orderFacets?.last30),
      prev30: pick(orderFacets?.prev30),
      byPayment: orderFacets?.byPayment ?? [],
      byCity: orderFacets?.byCity ?? [],
      byCategory: orderFacets?.byCategory ?? [],
      byHour: orderFacets?.byHour ?? [],
      byWeekday: orderFacets?.byWeekday ?? [],
      avgUnitsPerOrder: Number((basket?.avgUnits ?? 0).toFixed(2)),
      totalDiscountCents: basket?.discountCents ?? 0,
      couponUsageRate: validCount ? (basket?.couponOrders ?? 0) / validCount : 0,
      customersCount: customers?.customers ?? 0,
      repeatCustomerRate: customers?.customers ? customers.repeat / customers.customers : 0,
      openFulfilment: orderFacets?.openFulfilment?.[0]?.count ?? 0,
      cancellationRate30: cancelStats?.total ? cancelStats.cancelled / cancelStats.total : 0,
      abandonedOnline30: cancelStats?.abandonedOnline ?? 0,
      lowStock,
      subscribersTotal,
      subscribers30,
      messagesNew,
    };
  }
}
