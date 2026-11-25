import { IsDbId } from '../../../common/decorators';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto';
import { GrindType, RoastLevel } from '../../../common/enums';

export class FilterProductDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RoastLevel)
  roastLevel?: RoastLevel;

  @IsOptional()
  @IsEnum(GrindType)
  grindType?: GrindType;

  @IsOptional()
  @IsDbId()
  categoryId?: string;

  @IsOptional()
  @IsDbId()
  brandId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;
}

