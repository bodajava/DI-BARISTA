import { Controller, Get, Headers, Injectable, Logger, Module, UnauthorizedException } from '@nestjs/common';
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

@Module({
  imports: [OrderModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
