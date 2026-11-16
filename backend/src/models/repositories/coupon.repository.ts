import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Coupon, CouponDocument } from '../schemas/coupon.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CouponRepository extends BaseRepository<CouponDocument> {
  constructor(
    @InjectModel(Coupon.name)
    protected readonly couponModel: Model<CouponDocument>,
  ) {
    super(couponModel);
  }

  async findByCode(code: string): Promise<CouponDocument | null> {
    return this.findOne({ code: code.toUpperCase().trim() });
  }

  async incrementUsage(
    couponId: string | Types.ObjectId,
  ): Promise<CouponDocument | null> {
    return this.couponModel
      .findOneAndUpdate(
        {
          _id: couponId,
          deletedAt: null,
          isActive: true,
          $expr: { $lt: ['$usedCount', '$usageLimit'] },
        },
        { $inc: { usedCount: 1 } },
        { new: true },
      )
      .exec();
  }

  async incrementUsageByCode(code: string): Promise<CouponDocument | null> {
    return this.couponModel
      .findOneAndUpdate(
        {
          code: code.toUpperCase().trim(),
          deletedAt: null,
          isActive: true,
          $expr: { $lt: ['$usedCount', '$usageLimit'] },
        },
        { $inc: { usedCount: 1 } },
        { new: true },
      )
      .exec();
  }
}
