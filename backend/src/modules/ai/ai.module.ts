import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductRepository } from '../../models/repositories';
import { Product, ProductSchema } from '../../models/schemas';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CouponModule } from '../coupon/coupon.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    AnalyticsModule,
    CouponModule,
  ],
  controllers: [AiController],
  providers: [AiService, ProductRepository],
  exports: [AiService],
})
export class AiModule {}
