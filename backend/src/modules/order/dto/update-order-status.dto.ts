import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../../../common/enums';

export const ALLOWED_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PLACED,
  OrderStatus.PAID,
  OrderStatus.CONFIRMED,
  OrderStatus.ROASTING,
  OrderStatus.ROASTING_AND_PREPARING,
  OrderStatus.PACKING,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.ON_WAY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

export class UpdateOrderStatusDto {
  @IsIn(ALLOWED_ORDER_STATUSES)
  status: OrderStatus;
}


export class RefundOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
