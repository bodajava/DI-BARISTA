import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) || parsed < 1 ? 1 : Math.floor(parsed);
  })
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) || parsed < 1 ? 10 : Math.floor(parsed);
  })
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Decoupled GraphQL-compatible Pagination Arguments class
 */
export class PaginationArgs extends PaginationDto {}

