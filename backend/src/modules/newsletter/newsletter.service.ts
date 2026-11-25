import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto';
import { runInBackground } from '../../common/utilities/background';
import { assertDeliverableEmail } from '../../common/utilities/email';
import { EmailService } from '../../common/utilities/emails';
import { ilike, pageArgs, paginated, PrismaService } from '../../database/prisma.service';
import { SubscribeDto } from './dto';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(dto: SubscribeDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    await assertDeliverableEmail(email);
    const existing = await this.prisma.subscriber.findUnique({ where: { email } });
    // Insert-or-reactivate in one statement, so double submits can't create duplicates
    await this.prisma.subscriber.upsert({
      where: { email },
      create: { email, locale: dto.locale ?? 'en', source: dto.source ?? 'home' },
      update: { isActive: true, deletedAt: null },
    });
    // Welcome only brand-new subscribers (fire-and-forget, never blocks the form)
    if (!existing) {
      runInBackground(this.emailService.sendNewsletterWelcome(email, dto.locale === 'ar' ? 'ar' : 'en'), 'email');
    }
    // Same answer for new and existing emails, so the form can't be used to probe the list
    return { message: 'Subscribed' };
  }

  async findAll(query: PaginationQueryDto) {
    const where: Prisma.SubscriberWhereInput = {
      deletedAt: null,
      ...(query.search?.trim() ? { email: ilike(query.search) } : {}),
    };
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const [docs, total] = await Promise.all([
      this.prisma.subscriber.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.subscriber.count({ where }),
    ]);
    return paginated(docs, total, page, limit);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.prisma.subscriber.updateMany({
      where: { id, deletedAt: null },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Subscriber removed' };
  }
}
