import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubscriberDocument = HydratedDocument<Subscriber>;

/** Newsletter sign-ups from the storefront ("Subscribe now"), listed in the admin dashboard */
@Schema({
  timestamps: true,
  collection: 'subscribers',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Subscriber {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ type: String, enum: ['en', 'ar'], default: 'en' })
  locale: string;

  /** Where on the site they signed up, e.g. "home" */
  @Prop({ type: String, default: 'home', maxlength: 40 })
  source: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);
