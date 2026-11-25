import { forwardRef, Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CouponModule } from '../coupon/coupon.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderController } from './order.controller';
import { InvoiceService } from './invoice.service';
import { OrderService } from './order.service';

@Module({
  imports: [CartModule, CouponModule, forwardRef(() => PaymentModule)],
  controllers: [OrderController],
  providers: [OrderService, InvoiceService],
  exports: [OrderService, InvoiceService],
})
export class OrderModule {}
