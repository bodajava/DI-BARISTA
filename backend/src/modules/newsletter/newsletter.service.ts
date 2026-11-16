import { Injectable } from '@nestjs/common';
import { assertDeliverableEmail } from '../../common/utilities/email';
import { EmailService } from '../../common/utilities/emails';
import { PaginationQueryDto } from '../../common/dto';
import { IPaginatedResult } from '../../common/interfaces';
import { escapeRegex } from '../../common/utilities/regex';
import { SubscriberRepository } from '../../models/repositories';
import { SubscriberDocument } from '../../models/schemas';
import { SubscribeDto } from './dto';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly subscriberRepository: SubscriberRepository,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(dto: SubscribeDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    await assertDeliverableEmail(email);
    const { created } = await this.subscriberRepository.upsertByEmail(
      email,
      dto.locale ?? 'en',
      dto.source ?? 'home',
    );
    // Welcome only brand-new subscribers (fire-and-forget, never blocks the form)
    if (created) {
      void this.emailService.sendNewsletterWelcome(email, dto.locale === 'ar' ? 'ar' : 'en');
    }
    // Same answer for new and existing emails, so the form can't be used to probe the list
    return { message: 'Subscribed' };
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<IPaginatedResult<SubscriberDocument>> {
    const filter = query.search?.trim()
      ? { email: new RegExp(escapeRegex(query.search.trim().slice(0, 100)), 'i') }
      : {};
    return this.subscriberRepository.paginate(filter, query.page, query.limit, {
      sort: '-createdAt',
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.subscriberRepository.findOneAndUpdate(
      { _id: id },
      { $set: { isActive: false, deletedAt: new Date() } },
    );
    return { message: 'Subscriber removed' };
  }
}
