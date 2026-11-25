import { Body, Controller, Delete, Get, Global, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseIdPipe } from '../../common/pipes';
import { SettingsService } from './settings.service';
import { ShippingService } from './shipping.service';

class ZoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  governorate: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameAr?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  feeCents: number;

  /** "2" or "2-3" */
  @IsOptional()
  @Matches(/^\d{1,2}(-\d{1,2})?$/, { message: 'Days look like "2" or "2-3"' })
  days?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameAr?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  feeCents?: number;

  @IsOptional()
  @Matches(/^\d{1,2}(-\d{1,2})?$/, { message: 'Days look like "2" or "2-3"' })
  days?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateSettingsDto {
  @IsObject()
  @Transform(({ value }) => (value && typeof value === 'object' ? value : {}))
  values: Record<string, unknown>;
}

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class StoreController {
  constructor(
    private readonly settings: SettingsService,
    private readonly shipping: ShippingService,
  ) {}

  @Public()
  @Get('settings/public')
  publicSettings() {
    return this.settings.publicView();
  }

  @Public()
  @Get('shipping/zones')
  publicZones() {
    return this.shipping.list(true).then((zones) =>
      zones.map((z) => ({ governorate: z.governorate, nameEn: z.nameEn, nameAr: z.nameAr, feeCents: z.feeCents, days: z.days })),
    );
  }

  @Get('admin/settings')
  @Roles(...STAFF_ROLES)
  adminSettings() {
    return this.settings.adminView();
  }

  @Patch('admin/settings')
  @Roles(...ADMIN_ROLES)
  async updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser('sub') userId: string) {
    await this.settings.update(dto.values, userId);
    return this.settings.adminView();
  }

  @Get('admin/shipping-zones')
  @Roles(...STAFF_ROLES)
  zones() {
    return this.shipping.list(false);
  }

  @Post('admin/shipping-zones')
  @Roles(...ADMIN_ROLES)
  createZone(@Body() dto: ZoneDto, @CurrentUser('sub') userId: string) {
    return this.shipping.create(dto, userId);
  }

  @Patch('admin/shipping-zones/:id')
  @Roles(...ADMIN_ROLES)
  updateZone(@Param('id', ParseIdPipe) id: string, @Body() dto: UpdateZoneDto, @CurrentUser('sub') userId: string) {
    return this.shipping.update(id, dto, userId);
  }

  @Delete('admin/shipping-zones/:id')
  @Roles(...ADMIN_ROLES)
  removeZone(@Param('id', ParseIdPipe) id: string, @CurrentUser('sub') userId: string) {
    return this.shipping.remove(id, userId);
  }
}

@Global()
@Module({
  controllers: [StoreController],
  providers: [SettingsService, ShippingService],
  exports: [SettingsService, ShippingService],
})
export class StoreModule {}
