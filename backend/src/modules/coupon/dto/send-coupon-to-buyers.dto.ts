import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendCouponToBuyersDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  /** buyers = everyone who has ordered, subscribers = newsletter, list = the pasted emails */
  @IsOptional()
  @IsIn(['buyers', 'subscribers', 'list'])
  audience?: 'buyers' | 'subscribers' | 'list' = 'list';

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  emails?: string[];

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
