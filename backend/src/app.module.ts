import {
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { promises as dns } from 'dns';
import { validateEnvironment } from './common/dto';
import { RateLimitGuard } from './common/guards';
import { SharedModule } from './common/modules/shared';
import { CatalogSeeder } from './database/seeders/catalog.seeder';
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

const dbLogger = new Logger('DatabaseConnection');

async function resolveMongoUriWithFallback(
  configService: ConfigService,
): Promise<string> {
  const localFallbackUri = configService.get<string>(
    'LOCAL_DB_URL',
    'mongodb://127.0.0.1:27017/dibaresta_caffe',
  );
  const configuredUri =
    configService.get<string>('DB_URL') ||
    configService.get<string>('MONGODB_URI') ||
    localFallbackUri;

  if (!configuredUri.startsWith('mongodb+srv://')) {
    return configuredUri;
  }

  const hostMatch = configuredUri.match(
    /^mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)/,
  );
  const srvHost = hostMatch?.[1];

  if (!srvHost) {
    return configuredUri;
  }

  try {
    await dns.resolveSrv(`_mongodb._tcp.${srvHost}`);
    dbLogger.log(`Verified MongoDB Atlas SRV host (${srvHost})`);
    return configuredUri;
  } catch (error) {
    if (configService.get<string>('NODE_ENV') === 'production') {
      // Silently writing production orders into a local database would lose them
      throw new Error(
        `MongoDB Atlas SRV lookup failed for "${srvHost}": ${(error as Error).message}`,
      );
    }
    dbLogger.warn(
      `MongoDB Atlas SRV lookup failed for "${srvHost}" (${(error as Error).message}). Falling back to local MongoDB: ${localFallbackUri}`,
    );
    return localFallbackUri;
  }
}

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
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const uri = await resolveMongoUriWithFallback(configService);
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
        };
      },
    }),
    SharedModule,
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
  ],
  controllers: [TestStoreController],
  providers: [CatalogSeeder, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
