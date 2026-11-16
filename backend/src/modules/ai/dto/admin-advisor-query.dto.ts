import { IsIn, IsOptional, IsString } from 'class-validator';

export type AdvisorFocusArea =
  | 'PRICING'
  | 'PROMOTIONS'
  | 'INVENTORY'
  | 'GENERAL';

export const ADVISOR_FOCUS_AREAS: AdvisorFocusArea[] = [
  'PRICING',
  'PROMOTIONS',
  'INVENTORY',
  'GENERAL',
];

export class AdminAdvisorQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(ADVISOR_FOCUS_AREAS)
  focusArea?: AdvisorFocusArea = 'GENERAL';
}

