import { Transform, Type } from 'class-transformer';

const toNullableInt = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? null : Number(value);
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponDiscountType } from '../../../common/enums';

export class UpdateCouponDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'Use 3 to 32 letters, numbers, - or _' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  perCustomerLimit?: number | null;

  @IsOptional()
  @IsEnum(CouponDiscountType)
  discountType?: CouponDiscountType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  discountValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderAmountCents?: number;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  maxDiscountAmountCents?: number | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  allowedEmails?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
