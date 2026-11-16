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
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseMongoIdPipe } from '../../common/pipes';
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async create(
    @Body() dto: CreateCouponDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.couponService.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findAll(@Query() query: PaginationQueryDto) {
    return this.couponService.findAll(query);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.couponService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async remove(@Param('id', ParseMongoIdPipe) id: string) {
    return this.couponService.remove(id);
  }

  @Post('send-to-buyers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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
