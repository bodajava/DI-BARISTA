import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { OrderStatus } from '../../../common/enums';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  /** Goes into the order timeline */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RefundOrderDto {
  /** Required, kept on the order */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  /** Empty = full refund */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  amountPiasters?: number;

  /** Put the pieces back in stock (default on) */
  @IsOptional()
  @IsBoolean()
  restock?: boolean = true;
}
