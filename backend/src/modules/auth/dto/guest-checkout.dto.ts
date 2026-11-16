import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RoastLevel } from '../../../common/enums';

export class GuestShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  building?: string = 'NA';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  floor?: string = 'NA';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  apartment?: string = 'NA';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class GuestCheckoutCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Phone number must be a valid international or local number',
  })
  phone: string;

  @ValidateNested()
  @Type(() => GuestShippingAddressDto)
  shippingAddress: GuestShippingAddressDto;

  @IsOptional()
  @IsString()
  guestSessionId?: string;

  @IsOptional()
  @IsEnum(RoastLevel)
  favoriteRoast?: RoastLevel;
}

