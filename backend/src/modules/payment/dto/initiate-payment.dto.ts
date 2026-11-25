import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums';

export class PaymobBillingDataDto {
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsOptional()
  @IsString()
  city?: string = 'Cairo';

  @IsOptional()
  @IsString()
  country?: string = 'EG';

  @IsOptional()
  @IsString()
  street?: string = 'NA';

  @IsOptional()
  @IsString()
  building?: string = 'NA';

  @IsOptional()
  @IsString()
  floor?: string = 'NA';

  @IsOptional()
  @IsString()
  apartment?: string = 'NA';

  @IsOptional()
  @IsString()
  postal_code?: string = '12345';
}

export class InitiatePaymentDto {
  @IsString()
  @IsNotEmpty()
  orderReference: string;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  amountCents: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod = PaymentMethod.PAYMOB_CARD;

  @IsOptional()
  @IsArray()
  paymentMethods?: (number | string)[];

  @ValidateNested()
  @Type(() => PaymobBillingDataDto)
  billingData: PaymobBillingDataDto;
}

export class RefundPaymobOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
