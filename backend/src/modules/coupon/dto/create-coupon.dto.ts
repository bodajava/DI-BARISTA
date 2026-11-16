import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CouponDiscountType } from '../../../common/enums';
import {
  IsDateGte,
  IsDateGthanNow,
  IsValidDiscount,
} from '../../../common/decorators/custom-validators.decorator';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  code: string;

  @IsEnum(CouponDiscountType)
  discountType: CouponDiscountType = CouponDiscountType.PERCENTAGE;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsValidDiscount()
  discountValue: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderAmountCents?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDiscountAmountCents?: number;

  @IsDateString()
  @IsDateGthanNow()
  startDate: string;

  @IsDateString()
  @IsDateGte(['startDate'])
  endDate: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number = 100;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  allowedEmails?: string[] = [];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
