import { IsDbId } from '../../../common/decorators';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GrindType, RoastLevel } from '../../../common/enums';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name_ar?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  sku: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description_ar?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDbId()
  brandId?: string;

  @IsDbId()
  categoryId: string;

  @IsOptional()
  @IsEnum(RoastLevel)
  roastLevel?: RoastLevel = RoastLevel.MEDIUM;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s: string) => s.trim())
      : value,
  )
  @IsArray()
  @IsEnum(GrindType, { each: true })
  availableGrinds?: GrindType[];

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s: string) => s.trim())
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  flavorNotes?: string[];

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s: string) => s.trim())
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  tastingNotes_en?: string[];

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s: string) => s.trim())
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  tastingNotes_ar?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  originCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  originCountryAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  elevation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  elevationAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  processingMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  processingMethodAr?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  weightGrams?: number = 250;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  priceCents: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  discountPercent?: number = 0;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  /** Sale price; empty = no sale. Must be lower than priceCents */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? null : Number(value)))
  @IsInt()
  @Min(1)
  salePriceCents?: number | null;

  /** Private: what the piece costs the store */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? null : Number(value)))
  @IsInt()
  @Min(0)
  costCents?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  shortDescriptionAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

