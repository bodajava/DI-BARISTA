import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactMessageDocument = HydratedDocument<ContactMessage>;

export const CONTACT_MESSAGE_STATUSES = ['NEW', 'READ', 'ARCHIVED'] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

/** Messages sent from the storefront footer ("email + message"), read in the admin dashboard */
@Schema({
  timestamps: true,
  collection: 'contact_messages',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class ContactMessage {
  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ type: String, trim: true, maxlength: 80, default: '' })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  message: string;

  @Prop({ type: String, enum: ['en', 'ar'], default: 'en' })
  locale: string;

  @Prop({ type: String, enum: CONTACT_MESSAGE_STATUSES, default: 'NEW', index: true })
  status: ContactMessageStatus;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const ContactMessageSchema = SchemaFactory.createForClass(ContactMessage);
