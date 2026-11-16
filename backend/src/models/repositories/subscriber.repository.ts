import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscriber, SubscriberDocument } from '../schemas/subscriber.schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class SubscriberRepository extends BaseRepository<SubscriberDocument> {
  constructor(
    @InjectModel(Subscriber.name)
    protected readonly subscriberModel: Model<SubscriberDocument>,
  ) {
    super(subscriberModel);
  }

  /** Insert-or-reactivate in one atomic call, so double submits can't create duplicates */
  async upsertByEmail(
    email: string,
    locale: string,
    source: string,
  ): Promise<{ created: boolean }> {
    const result = await this.subscriberModel
      .updateOne(
        { email },
        {
          $set: { isActive: true, deletedAt: null },
          $setOnInsert: { email, locale, source },
        },
        { upsert: true },
      )
      .exec();
    return { created: result.upsertedCount > 0 };
  }
}
