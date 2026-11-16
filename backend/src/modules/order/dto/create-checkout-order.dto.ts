import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums';

export class CheckoutShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  building: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  floor?: string = 'NA';

  @IsOptional()
  @IsString()
  @MaxLength(30)
  apartment?: string = 'NA';

  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string = 'NA';
}

export class CreateCheckoutOrderDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  customerName: string;

  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  customerPhone: string;

  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  shippingAddress: CheckoutShippingAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  couponCode?: string;

  @IsIn([
    PaymentMethod.PAYMOB_CARD,
    PaymentMethod.MOBILE_WALLET,
    PaymentMethod.CASH_ON_DELIVERY,
  ])
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}
