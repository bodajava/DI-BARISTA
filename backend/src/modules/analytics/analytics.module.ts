import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';
import { AdminService } from './admin.service';
import { AdminController, AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CustomersService } from './customers.service';

@Module({
  imports: [OrderModule, ProductModule],
  controllers: [AnalyticsController, AdminController],
  providers: [AnalyticsService, CustomersService, AdminService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
