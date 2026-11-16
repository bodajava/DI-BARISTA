import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GrindType, RoastLevel } from '../../common/enums';
import { SlugUtil } from '../../common/utilities/slug';

export type ProductDocument = HydratedDocument<Product>;

export type ProductPublishStatus = 'ACTIVE' | 'DRAFT';

@Schema({ _id: false })
export class ProductVariant {
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ trim: true })
  labelAr?: string;

  @Prop({ required: true, min: 1 })
  priceCents: number;

  @Prop({ type: Number })
  weightGrams?: number;

  @Prop({ type: Number })
  capsulesCount?: number;
}

export const ProductVariantSchema =
  SchemaFactory.createForClass(ProductVariant);

@Schema({
  timestamps: true,
  collection: 'products',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Product {
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 160,
    index: true,
  })
  name: string;

  @Prop({ trim: true, maxlength: 160 })
  nameAr?: string;

  @Prop({ trim: true, maxlength: 160 })
  name_en?: string;

  @Prop({ trim: true, maxlength: 160 })
  name_ar?: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  slug: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  sku: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ trim: true, maxlength: 2000 })
  description_en?: string;

  @Prop({ trim: true, maxlength: 2000 })
  description_ar?: string;

  @Prop({ type: Types.ObjectId, ref: 'Brand', required: true, index: true })
  brandId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Category' }],
    default: [],
    index: true,
  })
  categoryIds?: Types.ObjectId[];

  @Prop({
    type: String,
    enum: RoastLevel,
    default: RoastLevel.MEDIUM,
    index: true,
  })
  roastLevel: RoastLevel;

  @Prop({
    type: [String],
    enum: GrindType,
    default: [
      GrindType.WHOLE_BEAN,
      GrindType.ESPRESSO,
      GrindType.FILTER_V60,
      GrindType.FRENCH_PRESS,
    ],
  })
  availableGrinds: GrindType[];

  @Prop({ type: [String], default: [] })
  flavorNotes: string[];

  @Prop({ type: [String], default: [] })
  tastingNotes_en?: string[];

  @Prop({ type: [String], default: [] })
  tastingNotes_ar?: string[];

  @Prop({ trim: true, maxlength: 100 })
  originCountry?: string;

  @Prop({ trim: true, maxlength: 120 })
  originCountryAr?: string;

  @Prop({ trim: true, maxlength: 100 })
  elevation?: string;

  @Prop({ trim: true, maxlength: 120 })
  elevationAr?: string;

  @Prop({ trim: true, maxlength: 120 })
  processingMethod?: string;

  @Prop({ trim: true, maxlength: 140 })
  processingMethodAr?: string;

  @Prop({ type: Number, min: 50, default: 250 })
  weightGrams: number;

  @Prop({ required: true, min: 1 })
  priceCents: number;

  @Prop({ type: Number, min: 1 })
  maxPriceCents?: number;

  @Prop({ type: Number, min: 0, max: 90, default: 0 })
  discountPercent: number;

  @Prop({ required: true, min: 1 })
  finalPriceCents: number;

  @Prop({ type: [ProductVariantSchema], default: [] })
  variants?: ProductVariant[];

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ type: Number, min: 0, default: 0 })
  soldCount: number;

  @Prop({ type: Number, min: 0, default: 0 })
  viewsCount: number;

  @Prop({ type: [String], default: [] })
  imageUrls: string[];

  @Prop({ type: [String], default: [] })
  imageKeys: string[];

  @Prop({
    type: String,
    enum: ['ACTIVE', 'DRAFT'],
    default: 'ACTIVE',
    index: true,
  })
  status: ProductPublishStatus;

  @Prop({ default: false, index: true })
  isFeatured: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.pre('validate', function (next) {
  if (this.name_en && !this.name) {
    this.name = this.name_en;
  } else if (this.name && !this.name_en) {
    this.name_en = this.name;
  }
  if (this.name_ar && !this.nameAr) {
    this.nameAr = this.name_ar;
  } else if (this.nameAr && !this.name_ar) {
    this.name_ar = this.nameAr;
  }
  if (this.description_en && !this.description) {
    this.description = this.description_en;
  } else if (this.description && !this.description_en) {
    this.description_en = this.description;
  }
  if (this.tastingNotes_en?.length && !this.flavorNotes?.length) {
    this.flavorNotes = this.tastingNotes_en;
  } else if (this.flavorNotes?.length && !this.tastingNotes_en?.length) {
    this.tastingNotes_en = this.flavorNotes;
  }
  if (this.isModified('name') && this.name && !this.slug) {
    this.slug = SlugUtil.generate(this.name);
  }
  if (this.priceCents !== undefined) {
    const discount = this.discountPercent || 0;
    this.finalPriceCents = Math.max(
      1,
      Math.round(this.priceCents * (1 - discount / 100)),
    );
  }
  next();
});
