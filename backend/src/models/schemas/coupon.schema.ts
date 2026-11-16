import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CouponDiscountType } from '../../common/enums';

export type CouponDocument = HydratedDocument<Coupon>;

@Schema({
  timestamps: true,
  collection: 'coupons',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Coupon {
  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  code: string;

  @Prop({
    type: String,
    enum: CouponDiscountType,
    default: CouponDiscountType.PERCENTAGE,
  })
  discountType: CouponDiscountType;

  @Prop({ required: true, min: 1 })
  discountValue: number;

  @Prop({ type: Number, min: 0, default: 0 })
  minOrderAmountCents: number;

  @Prop({ type: Number, min: 1, default: null })
  maxDiscountAmountCents?: number | null;

  @Prop({ required: true, type: Date })
  startDate: Date;

  @Prop({ required: true, type: Date })
  endDate: Date;

  @Prop({ type: Number, min: 1, default: 100 })
  usageLimit: number;

  @Prop({ type: Number, min: 0, default: 0 })
  usedCount: number;

  @Prop({ type: [String], default: [] })
  allowedEmails: string[];

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
