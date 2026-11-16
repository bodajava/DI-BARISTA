import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GrindType } from '../../common/enums';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ _id: true })
export class CartItem {
  _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  sku: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 1 })
  unitPriceCents: number;

  @Prop({ required: true, min: 1, max: 50 })
  quantity: number;

  @Prop({
    type: String,
    enum: GrindType,
    default: GrindType.WHOLE_BEAN,
  })
  selectedGrind: GrindType;

  @Prop({ trim: true, maxlength: 120 })
  variantLabel?: string;

  @Prop({ trim: true, maxlength: 120 })
  variantLabelAr?: string;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({
  timestamps: true,
  collection: 'carts',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Cart {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  guestSessionId: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true,
  })
  userId?: Types.ObjectId | null;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];

  @Prop({ type: Number, default: 0, min: 0 })
  subTotalCents: number;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const CartSchema = SchemaFactory.createForClass(Cart);
