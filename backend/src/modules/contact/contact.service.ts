import { runInBackground } from '../../common/utilities/background';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto';
import { IPaginatedResult } from '../../common/interfaces';
import { assertDeliverableEmail } from '../../common/utilities/email';
import { EmailService } from '../../common/utilities/emails';
import { escapeRegex } from '../../common/utilities/regex';
import { ContactMessageRepository } from '../../models/repositories';
import { ContactMessageDocument } from '../../models/schemas';
import { CreateContactMessageDto, UpdateContactMessageDto } from './dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly contactMessageRepository: ContactMessageRepository,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateContactMessageDto): Promise<{ message: string }> {
    await assertDeliverableEmail(dto.email);
    await this.contactMessageRepository.create({
      email: dto.email,
      name: dto.name ?? '',
      // Stored as plain text; the dashboard renders it as text, never as HTML
      message: dto.message.replace(/\r\n/g, '\n'),
      locale: dto.locale ?? 'en',
      status: 'NEW',
    });
    runInBackground(this.emailService.notifyAdminNewMessage({
      email: dto.email,
      message: dto.message,
      locale: dto.locale,
    }), 'email');
    return { message: 'Message received' };
  }

  async findAll(
    query: PaginationQueryDto & { status?: string },
  ): Promise<IPaginatedResult<ContactMessageDocument>> {
    const filter: Record<string, unknown> = {};
    if (query.status && ['NEW', 'READ', 'ARCHIVED'].includes(query.status)) {
      filter.status = query.status;
    }
    if (query.search?.trim()) {
      const rx = new RegExp(escapeRegex(query.search.trim().slice(0, 100)), 'i');
      filter.$or = [{ email: rx }, { name: rx }, { message: rx }];
    }
    const [page, newCount] = await Promise.all([
      this.contactMessageRepository.paginate(filter, query.page, query.limit, {
        sort: '-createdAt',
      }),
      this.contactMessageRepository.countNew(),
    ]);
    // newCount rides in meta: the response interceptor only forwards docs + meta
    return { docs: page.docs, meta: { ...page.meta, newCount } as typeof page.meta };
  }

  async updateStatus(id: string, dto: UpdateContactMessageDto) {
    const updated = await this.contactMessageRepository.findOneAndUpdate(
      { _id: id },
      { $set: { status: dto.status } },
    );
    if (!updated) throw new NotFoundException('Message not found');
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.contactMessageRepository.findOneAndUpdate(
      { _id: id },
      { $set: { deletedAt: new Date() } },
    );
    return { message: 'Message deleted' };
  }
}
