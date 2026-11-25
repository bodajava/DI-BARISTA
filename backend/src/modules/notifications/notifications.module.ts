import { Body, Controller, Delete, Get, Global, HttpCode, HttpStatus, Module, Post, UseGuards } from '@nestjs/common';
import { DeviceAudience } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RateLimit } from '../../common/decorators';
import { STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IJwtPayload } from '../../common/interfaces';
import { PushService } from './push.service';

class RegisterDeviceDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token: string;

  @IsOptional()
  @IsIn(['STAFF', 'CUSTOMER'])
  audience?: DeviceAudience;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: string;
}

class UnregisterDeviceDto {
  @IsString()
  @MaxLength(4096)
  token: string;
}

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly push: PushService) {}

  /** Whether the server can send pushes at all (dashboard shows "not set up" otherwise) */
  @Get('status')
  status() {
    return { configured: this.push.configured };
  }

  @Post('devices')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 20, windowSeconds: 60 })
  async register(@Body() dto: RegisterDeviceDto, @CurrentUser() user: IJwtPayload) {
    // Only staff may subscribe a device to the staff feed (new orders, messages, stock)
    const audience =
      dto.audience === 'STAFF' && STAFF_ROLES.includes(user.role) ? DeviceAudience.STAFF : DeviceAudience.CUSTOMER;
    await this.push.register(dto.token, audience, user.sub, dto.locale ?? 'en');
    return { registered: true, audience };
  }

  @Delete('devices')
  async unregister(@Body() dto: UnregisterDeviceDto) {
    await this.push.unregister(dto.token);
    return { registered: false };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}
