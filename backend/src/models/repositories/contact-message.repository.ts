import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactMessage, ContactMessageDocument } from '../schemas/contact-message.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class ContactMessageRepository extends BaseRepository<ContactMessageDocument> {
  constructor(
    @InjectModel(ContactMessage.name)
    protected readonly contactMessageModel: Model<ContactMessageDocument>,
  ) {
    super(contactMessageModel);
  }

  async countNew(): Promise<number> {
    return this.contactMessageModel.countDocuments({ status: 'NEW', deletedAt: null }).exec();
  }
}
