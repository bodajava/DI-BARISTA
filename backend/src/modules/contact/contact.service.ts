import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto';
import { runInBackground } from '../../common/utilities/background';
import { assertDeliverableEmail } from '../../common/utilities/email';
import { EmailService } from '../../common/utilities/emails';
import { ilike, pageArgs, paginated, PrismaService } from '../../database/prisma.service';
import { PushService } from '../notifications/push.service';
import { CreateContactMessageDto, UpdateContactMessageDto } from './dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly push: PushService,
  ) {}

  async create(dto: CreateContactMessageDto): Promise<{ message: string }> {
    await assertDeliverableEmail(dto.email);
    const saved = await this.prisma.contactMessage.create({
      data: {
        email: dto.email,
        name: dto.name ?? '',
        phone: dto.phone || null,
        subject: dto.subject || null,
        // Stored as plain text; the dashboard renders it as text, never as HTML
        message: dto.message.replace(/\r\n/g, '\n'),
        locale: dto.locale === 'ar' ? 'ar' : 'en',
      },
    });
    runInBackground(
      this.emailService.notifyAdminNewMessage({ email: dto.email, message: dto.message, locale: dto.locale }),
      'email',
    );
    runInBackground(
      this.push.toStaff({
        kind: 'message',
        title: { en: 'New message', ar: 'رسالة جديدة' },
        body: { en: `${dto.name || dto.email}: ${dto.message.slice(0, 80)}`, ar: `${dto.name || dto.email}: ${dto.message.slice(0, 80)}` },
        link: `/admin/messages?open=${saved.id}`,
      }),
      'push',
    );
    return { message: 'Message received' };
  }

  async findAll(query: PaginationQueryDto & { status?: string; unread?: string }) {
    const where: Prisma.ContactMessageWhereInput = { deletedAt: null };
    if (query.unread === '1' || query.unread === 'true') where.status = ContactStatus.NEW;
    else if (query.status && (Object.values(ContactStatus) as string[]).includes(query.status)) {
      where.status = query.status as ContactStatus;
    }
    if (query.search?.trim()) {
      where.OR = [
        { email: ilike(query.search) },
        { name: ilike(query.search) },
        { subject: ilike(query.search) },
        { message: ilike(query.search) },
      ];
    }
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const [docs, total, newCount, allCount] = await Promise.all([
      this.prisma.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.contactMessage.count({ where }),
      this.prisma.contactMessage.count({ where: { deletedAt: null, status: ContactStatus.NEW } }),
      this.prisma.contactMessage.count({ where: { deletedAt: null } }),
    ]);
    const result = paginated(docs, total, page, limit);
    // Counts ride in meta: the response interceptor only forwards docs + meta
    return { docs: result.docs, meta: { ...result.meta, newCount, allCount } as typeof result.meta };
  }

  async updateStatus(id: string, dto: UpdateContactMessageDto) {
    const existing = await this.prisma.contactMessage.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Message not found');
    return this.prisma.contactMessage.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === ContactStatus.READ && !existing.readAt ? { readAt: new Date() } : {}),
        ...(dto.status === ContactStatus.REPLIED ? { repliedAt: new Date(), readAt: existing.readAt ?? new Date() } : {}),
        ...(dto.status === ContactStatus.NEW ? { readAt: null } : {}),
      },
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.prisma.contactMessage.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    return { message: 'Message deleted' };
  }

  unreadCount(): Promise<number> {
    return this.prisma.contactMessage.count({ where: { deletedAt: null, status: ContactStatus.NEW } });
  }
}
