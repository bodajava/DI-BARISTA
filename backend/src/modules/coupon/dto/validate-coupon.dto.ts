import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  subTotalCents: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}
