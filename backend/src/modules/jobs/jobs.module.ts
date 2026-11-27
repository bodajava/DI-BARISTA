import { Controller, Get, Headers, HttpStatus, Injectable, Logger, Module, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { CacheService } from '../../common/utilities/caching';
import { PrismaService } from '../../database/prisma.service';
import { Interval } from '@nestjs/schedule';
import { timingSafeEqual } from 'crypto';
import { Public } from '../../common/decorators';
import { OrderModule } from '../order/order.module';
import { OrderService } from '../order/order.service';

/**
 * Background jobs. On a long-running server they run on a timer; on Vercel (no timers between
 * requests) call GET /api/v1/jobs/run with "Authorization: Bearer <CRON_SECRET>", and the
 * dashboard also triggers the unpaid-order expiry whenever it lists orders.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly orders: OrderService) {}

  @Interval(5 * 60 * 1000)
  async tick(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.run().catch((e) => this.logger.warn(`Jobs failed: ${(e as Error).message}`));
  }

  async run() {
    const expired = await this.orders.expireUnpaidOrders();
    return { expiredOrders: expired };
  }
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Public()
  @Get('run')
  run(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    const given = (auth ?? '').replace(/^Bearer\s+/i, '');
    if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
      throw new UnauthorizedException();
    }
    return this.jobs.run();
  }
}

/** Uptime check: database and cache must answer. 200 = healthy, 503 = something is down */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Public()
  @Get()
  async check(@Res() res: Response) {
    const started = Date.now();
    const result: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      result.database = 'ok';
    } catch {
      result.database = 'down';
    }
    try {
      const key = 'health:ping';
      await this.cache.set(key, 1, 30);
      result.cache = (await this.cache.exists(key)) ? 'ok' : 'degraded';
    } catch {
      result.cache = 'down';
    }
    const healthy = result.database === 'ok';
    res
      .status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json({ status: healthy ? 'ok' : 'down', ...result, ms: Date.now() - started, at: new Date().toISOString() });
  }
}

@Module({
  imports: [OrderModule],
  controllers: [JobsController, HealthController],
  providers: [JobsService],
})
export class JobsModule {}
