import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Public, RateLimit, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { ADMIN_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseIdPipe } from '../../common/pipes';
import { CouponService } from './coupon.service';
import {
  CreateCouponDto,
  SendCouponToBuyersDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto';

@Controller('coupons')
@UseGuards(AuthGuard, RolesGuard)
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @Roles(...ADMIN_ROLES)
  async create(
    @Body() dto: CreateCouponDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.couponService.create(dto, userId);
  }

  @Get()
  @Roles(...ADMIN_ROLES)
  async findAll(@Query() query: PaginationQueryDto) {
    return this.couponService.findAll(query);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.couponService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  async remove(@Param('id', ParseIdPipe) id: string, @CurrentUser('sub') userId: string) {
    return this.couponService.remove(id, userId);
  }

  @Post('send-to-buyers')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  async sendToBuyers(@Body() dto: SendCouponToBuyersDto) {
    return this.couponService.sendCouponToBuyers(dto);
  }

  @Public()
  @RateLimit({ limit: 15, windowSeconds: 10 * 60 })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.couponService.validateAndCalculateDiscount(dto);
  }
}
