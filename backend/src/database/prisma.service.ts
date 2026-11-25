import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { IPaginatedResult } from '../common/interfaces';

/** One shared PrismaClient for the whole app (PostgreSQL) */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      // Serverless cold starts connect lazily on the first query; don't crash the boot
      this.logger.error(`PostgreSQL connection failed: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}

/** "-createdAt" / "price" style sort strings → Prisma orderBy, limited to allowed fields */
export function toOrderBy(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
): Record<string, 'asc' | 'desc'>[] {
  if (!sort) return [fallback];
  const parts = sort
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const desc = s.startsWith('-');
      const field = desc ? s.slice(1) : s;
      return { field, dir: desc ? 'desc' : 'asc' } as const;
    })
    .filter((p) => allowed.includes(p.field));
  return parts.length ? parts.map((p) => ({ [p.field]: p.dir })) : [fallback];
}

export function pageArgs(page?: number, limit?: number, max = 100) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(max, Number(limit) || 10));
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit, take: safeLimit };
}

export function paginated<T>(docs: T[], totalDocs: number, page: number, limit: number): IPaginatedResult<T> {
  const totalPages = Math.ceil(totalDocs / limit) || 1;
  return {
    docs,
    meta: {
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/** Case-insensitive "contains" for Prisma string filters */
export function ilike(value: string): Prisma.StringFilter {
  return { contains: value.trim().slice(0, 100), mode: 'insensitive' };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
