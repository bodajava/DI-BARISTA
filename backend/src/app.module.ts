import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnvironment } from './common/dto';
import { RateLimitGuard } from './common/guards';
import { SharedModule } from './common/modules/shared';
import { PrismaModule } from './database/prisma.service';
import { AuditModule } from './modules/audit/audit.service';
import { GiftCardModule } from './modules/gift-card/gift-card.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StoreModule } from './modules/store/store.module';
import { WheelModule } from './modules/wheel/wheel.module';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoryModule } from './modules/category/category.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { NewsletterModule } from './modules/newsletter/newsletter.module';
import { ContactModule } from './modules/contact/contact.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ProductModule } from './modules/product/product.module';
import { TestStoreController } from './test-store.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SharedModule,
    AuditModule,
    NotificationsModule,
    StoreModule,
    GiftCardModule,
    AuthModule,
    BrandModule,
    CategoryModule,
    ProductModule,
    CartModule,
    CouponModule,
    NewsletterModule,
    ContactModule,
    OrderModule,
    PaymentModule,
    AnalyticsModule,
    AiModule,
    WheelModule,
    JobsModule,
  ],
  controllers: [TestStoreController],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
