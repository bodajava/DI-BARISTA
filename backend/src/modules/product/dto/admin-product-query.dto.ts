import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto';
import { IsDbId } from '../../../common/decorators';

export class AdminProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['all', 'active', 'hidden', 'deleted'])
  show?: 'all' | 'active' | 'hidden' | 'deleted';

  @IsOptional()
  @IsDbId()
  categoryId?: string;
}

const toNullableInt = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? null : Number(value);

/** A version of a product (size, finish, pack): own price, sale price and stock */
export class VariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  priceCents: number;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  salePriceCents?: number | null;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  @Max(100000)
  weightGrams?: number | null;

  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  capsulesCount?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateVariantDto extends PartialType(VariantDto) {}
