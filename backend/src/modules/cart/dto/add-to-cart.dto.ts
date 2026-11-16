import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { GrindType } from '../../../common/enums';

export class AddToCartDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number = 1;

  @IsOptional()
  @IsEnum(GrindType)
  selectedGrind?: GrindType = GrindType.WHOLE_BEAN;

  @IsOptional()
  @IsString()
  variantLabel?: string;
}

