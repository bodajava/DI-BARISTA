import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../../../common/enums';

export class QueryOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  /** A customer: user id or the email of a guest */
  @IsOptional()
  @IsString()
  @MaxLength(254)
  customer?: string;

  /** Include per-status counts in meta (dashboard tabs) */
  @IsOptional()
  @IsIn(['0', '1'])
  withCounts?: string;
}
