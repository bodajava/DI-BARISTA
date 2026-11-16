import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendCouponToBuyersDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  emails: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customMessage?: string;

  @IsOptional()
  @IsBoolean()
  restrictToRecipients?: boolean = false;

  /** Language of the promo email */
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

