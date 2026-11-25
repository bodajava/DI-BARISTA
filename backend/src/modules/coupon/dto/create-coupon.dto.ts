import { Transform, Type } from 'class-transformer';
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
import { IsDateGte, IsValidDiscount } from '../../../common/decorators/custom-validators.decorator';

const toNullableInt = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? null : Number(value);

export class CreateCouponDto {
  /** 3–32 characters, A-Z 0-9 - _ (saved in capitals) */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'Use 3 to 32 letters, numbers, - or _' })
  code: string;

  /** Private note for the team */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

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
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  maxDiscountAmountCents?: number | null;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsDateGte(['startDate'])
  endDate: string;

  /** Total uses; empty = unlimited */
  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  /** Uses per customer; empty = unlimited */
  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  perCustomerLimit?: number | null;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  allowedEmails?: string[] = [];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
