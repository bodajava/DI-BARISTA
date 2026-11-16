import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { AnalyticsService } from './analytics.service';
import { OverviewAnalyticsQueryDto, SalesTrendQueryDto } from './dto';

@Controller('admin/analytics')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(@Query() query: OverviewAnalyticsQueryDto) {
    return this.analyticsService.getOverviewKpis(query);
  }

  @Get('products-performance')
  async getProductsPerformance() {
    return this.analyticsService.getProductsPerformance();
  }

  @Get('customers')
  async getCustomersDirectory() {
    return this.analyticsService.getCustomersDirectory();
  }

  @Get('insights')
  async getBusinessInsights() {
    return this.analyticsService.getBusinessInsights();
  }

  @Get('sales-trend')
  async getSalesTrend(@Query() query: SalesTrendQueryDto) {
    return this.analyticsService.getSalesTrend(query);
  }
}

