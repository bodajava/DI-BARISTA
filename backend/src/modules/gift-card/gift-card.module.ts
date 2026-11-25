import { Body, Controller, Get, Global, Module, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { ADMIN_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseIdPipe } from '../../common/pipes';
import { GiftCardService } from './gift-card.service';

class IssueGiftCardDto {
  /** 50–10,000 EGP, in piasters */
  @Type(() => Number)
  @IsInt()
  @Min(GiftCardService.MIN_CENTS)
  @Max(GiftCardService.MAX_CENTS)
  amountCents: number;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

class ToggleGiftCardDto {
  @IsBoolean()
  active: boolean;
}

@Controller('admin/gift-cards')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
export class GiftCardController {
  constructor(private readonly giftCards: GiftCardService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.giftCards.list(query.page, query.limit);
  }

  @Post()
  issue(@Body() dto: IssueGiftCardDto, @CurrentUser('sub') userId: string) {
    return this.giftCards.issue(dto, userId);
  }

  @Patch(':id')
  toggle(@Param('id', ParseIdPipe) id: string, @Body() dto: ToggleGiftCardDto, @CurrentUser('sub') userId: string) {
    return this.giftCards.setStatus(id, dto.active, userId);
  }
}

@Global()
@Module({
  controllers: [GiftCardController],
  providers: [GiftCardService],
  exports: [GiftCardService],
})
export class GiftCardModule {}
