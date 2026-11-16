import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SlugUtil } from '../../common/utilities/slug';

export type BrandDocument = HydratedDocument<Brand>;

@Schema({
  timestamps: true,
  collection: 'brands',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Brand {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  })
  name: string;

  @Prop({ trim: true, maxlength: 120 })
  nameAr?: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  slug: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ trim: true, maxlength: 80 })
  originCountry?: string;

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  @Prop({ type: String, default: null })
  logoKey?: string | null;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const BrandSchema = SchemaFactory.createForClass(Brand);

BrandSchema.pre('validate', function (next) {
  if (this.isModified('name') && this.name && !this.slug) {
    this.slug = SlugUtil.generate(this.name);
  }
  next();
});

