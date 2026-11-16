import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class OverviewAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SalesTrendQueryDto extends OverviewAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  interval?: 'day' | 'week' | 'month' = 'day';
}

