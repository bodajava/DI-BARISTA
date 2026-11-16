import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubscribeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({ allow_display_name: false, require_tld: true }, { message: 'Please enter a valid email address' })
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
