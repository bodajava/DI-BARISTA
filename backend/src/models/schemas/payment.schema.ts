import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../../common/enums';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({
  timestamps: true,
  collection: 'payments',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.paymentKeyToken;
      delete ret.clientSecret;
      delete ret.__v;
      return ret;
    },
  },
})
export class Payment {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true,
  })
  userId?: Types.ObjectId | null;

  @Prop({ type: String, default: null, index: true })
  guestSessionId?: string | null;

  @Prop({ required: true, trim: true, index: true })
  orderReference: string;

  @Prop({
    type: String,
    enum: PaymentProvider,
    default: PaymentProvider.PAYMOB,
  })
  provider: PaymentProvider;

  @Prop({
    type: String,
    enum: PaymentMethod,
    default: PaymentMethod.CARD,
  })
  method: PaymentMethod;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    index: true,
  })
  status: PaymentStatus;

  @Prop({ required: true, min: 1 })
  amountCents: number;

  @Prop({ default: 'EGP', uppercase: true, trim: true })
  currency: string;

  @Prop({ type: String, index: true, default: null })
  paymobIntentionId?: string | null;

  @Prop({ type: Number, index: true, default: null })
  paymobOrderId?: number | null;

  @Prop({ type: Number, index: true, default: null })
  paymobTransactionId?: number | null;

  @Prop({ type: String, select: false, default: null })
  clientSecret?: string | null;

  @Prop({ type: String, select: false, default: null })
  paymentKeyToken?: string | null;

  @Prop({ type: String, default: null })
  checkoutUrl?: string | null;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  billingData?: Record<string, unknown>;

  @Prop({ default: false })
  webhookVerified: boolean;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;

  @Prop({ type: String, default: null })
  failureReason?: string | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
