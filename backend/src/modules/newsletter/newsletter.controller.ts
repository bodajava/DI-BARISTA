import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public, RateLimit, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseIdPipe } from '../../common/pipes';
import { SubscribeDto } from './dto';
import { NewsletterService } from './newsletter.service';

@Controller('newsletter')
@UseGuards(AuthGuard, RolesGuard)
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 10 * 60, bodyKey: 'email' })
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(@Body() dto: SubscribeDto) {
    return this.newsletterService.subscribe(dto);
  }

  @Get('subscribers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findAll(@Query() query: PaginationQueryDto) {
    return this.newsletterService.findAll(query);
  }

  @Delete('subscribers/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async remove(@Param('id', ParseIdPipe) id: string) {
    return this.newsletterService.remove(id);
  }
}
