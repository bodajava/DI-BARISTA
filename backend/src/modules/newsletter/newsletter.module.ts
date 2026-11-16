import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriberRepository } from '../../models/repositories';
import { Subscriber, SubscriberSchema } from '../../models/schemas';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Subscriber.name, schema: SubscriberSchema }]),
  ],
  controllers: [NewsletterController],
  providers: [NewsletterService, SubscriberRepository],
})
export class NewsletterModule {}
