import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderStatus, PaymentStatus } from '../../common/enums';
import { Order, OrderDocument } from '../schemas';
import { BaseRepository } from './base.repository';

@Injectable()
export class OrderRepository extends BaseRepository<OrderDocument> {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {
    super(orderModel);
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderDocument | null> {
    return this.findOne({
      orderNumber: orderNumber.toUpperCase().trim(),
    });
  }

  async findByPaymobOrderId(
    paymobOrderId: number,
  ): Promise<OrderDocument | null> {
    return this.findOne({ paymobOrderId });
  }

  async getAnalyticsSummary(): Promise<Record<string, unknown>> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [result] = await this.orderModel
      .aggregate([
        { $match: { deletedAt: null } },
        {
          $facet: {
            revenueOverview: [
              {
                $match: {
                  $or: [
                    { paymentStatus: PaymentStatus.SUCCESS },
                    { paymentStatus: PaymentStatus.CAPTURED },
                    { status: OrderStatus.PAID },
                    { status: OrderStatus.DELIVERED },
                  ],
                },
              },
              {
                $group: {
                  _id: null,
                  totalRevenueCents: { $sum: '$totalCents' },
                  totalDiscountsCents: { $sum: '$discountCents' },
                  paidOrdersCount: { $sum: 1 },
                  avgOrderValueCents: { $avg: '$totalCents' },
                },
              },
            ],
            ordersByStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                },
              },
            ],
            topSellingProducts: [
              { $unwind: '$items' },
              {
                $group: {
                  _id: {
                    productId: '$items.productId',
                    sku: '$items.sku',
                    name: '$items.name',
                    selectedGrind: '$items.selectedGrind',
                  },
                  totalUnitsSold: { $sum: '$items.quantity' },
                  totalSalesCents: { $sum: '$items.lineTotalCents' },
                },
              },
              { $sort: { totalUnitsSold: -1 } },
              { $limit: 10 },
            ],
            dailyRevenueLast30Days: [
              {
                $match: {
                  createdAt: { $gte: thirtyDaysAgo },
                  status: { $ne: OrderStatus.CANCELLED },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                  },
                  ordersCount: { $sum: 1 },
                  dailyRevenueCents: { $sum: '$totalCents' },
                },
              },
              { $sort: { _id: 1 } },
            ],
          },
        },
      ])
      .exec();

    return result || {};
  }
}
