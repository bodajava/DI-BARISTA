import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RoastLevel, STAFF_ROLES, UserRole } from '../../common/enums';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class CustomerShippingAddress {
  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  street: string;

  @Prop({ trim: true, default: 'NA' })
  building: string;

  @Prop({ trim: true, default: 'NA' })
  floor: string;

  @Prop({ trim: true, default: 'NA' })
  apartment: string;

  @Prop({ trim: true })
  notes?: string;
}

export const CustomerShippingAddressSchema = SchemaFactory.createForClass(
  CustomerShippingAddress,
);

@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.password;
      delete ret.otpHash;
      delete ret.otpExpiresAt;
      delete ret.refreshTokenHash;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true, minlength: 2, maxlength: 100 })
  fullName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  /**
   * Password is required for Staff (SUPER_ADMIN, ADMIN, BARISTA) and registered accounts,
   * but optional (null) for Guest Checkout customers (isGuest = true).
   */
  @Prop({
    type: String,
    required: function (this: User) {
      return !this.isGuest || STAFF_ROLES.includes(this.role);
    },
    select: false,
    default: null,
  })
  password?: string | null;

  @Prop({ type: String, default: null })
  phoneEncrypted?: string | null;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.CUSTOMER,
    index: true,
  })
  role: UserRole;

  @Prop({ default: false, index: true })
  isGuest: boolean;

  @Prop({ type: String, default: null, index: true })
  guestSessionId?: string | null;

  @Prop({ type: CustomerShippingAddressSchema, default: null })
  shippingAddress?: CustomerShippingAddress | null;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, select: false, default: null })
  otpHash?: string | null;

  @Prop({ type: Date, select: false, default: null })
  otpExpiresAt?: Date | null;

  @Prop({ type: String, select: false, default: null })
  refreshTokenHash?: string | null;

  @Prop({ type: String, enum: RoastLevel, default: RoastLevel.MEDIUM })
  favoriteRoast?: RoastLevel;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
