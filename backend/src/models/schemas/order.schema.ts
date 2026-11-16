import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  GrindType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../common/enums';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  sku: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 1 })
  unitPriceCents: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ type: String, enum: GrindType, default: GrindType.WHOLE_BEAN })
  selectedGrind: GrindType;

  @Prop({ required: true, min: 1 })
  lineTotalCents: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderShippingAddress {
  @Prop({ required: true, trim: true })
  street: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  building: string;

  @Prop({ trim: true, default: 'NA' })
  floor?: string;

  @Prop({ trim: true, default: 'NA' })
  apartment?: string;

  @Prop({ trim: true, default: 'NA' })
  postalCode?: string;
}

export const OrderShippingAddressSchema =
  SchemaFactory.createForClass(OrderShippingAddress);

@Schema({
  timestamps: true,
  collection: 'orders',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Order {
  @Prop({ required: true, unique: true, uppercase: true, index: true })
  orderNumber: string;

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

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  customerEmail: string;

  @Prop({ required: true, trim: true })
  customerPhone: string;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ type: OrderShippingAddressSchema, required: true })
  shippingAddress: OrderShippingAddress;

  @Prop({ type: String, default: null })
  notes?: string | null;

  /** Storefront language at checkout, so emails go out in the customer's language */
  @Prop({ type: String, enum: ['en', 'ar'], default: 'en' })
  locale?: string;

  @Prop({ required: true, min: 0 })
  subTotalCents: number;

  @Prop({ default: 0, min: 0 })
  discountCents: number;

  @Prop({ type: String, default: null })
  couponCode?: string | null;

  @Prop({ default: 5000, min: 0 })
  shippingFeeCents: number;

  @Prop({ required: true, min: 1 })
  totalCents: number;

  @Prop({
    type: String,
    enum: PaymentMethod,
    default: PaymentMethod.PAYMOB_CARD,
  })
  paymentMethod: PaymentMethod;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    index: true,
  })
  paymentStatus: PaymentStatus;

  @Prop({
    type: String,
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
    index: true,
  })
  status: OrderStatus;

  @Prop({ type: Number, index: true, default: null })
  paymobOrderId?: number | null;

  @Prop({ type: String, index: true, default: null })
  intentionId?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  handledByStaffId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
