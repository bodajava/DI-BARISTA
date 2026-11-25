import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Records who changed what in the dashboard (before/after), for the audit log page */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string | null | undefined,
    action: string,
    entity: string,
    entityId?: string | null,
    before?: unknown,
    after?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: userId || null,
          action,
          entity,
          entityId: entityId ?? null,
          before: toJson(before),
          after: toJson(after),
        },
      });
    } catch (error) {
      // Never let the audit trail break the action itself
      this.logger.warn(`Audit log failed for ${action}: ${(error as Error).message}`);
    }
  }

  async list(page = 1, limit = 50, entity?: string) {
    const take = Math.min(100, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;
    const where: Prisma.AuditLogWhereInput = entity ? { entity } : {};
    const [docs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const totalPages = Math.ceil(total / take) || 1;
    return {
      docs,
      meta: { totalDocs: total, limit: take, page, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
