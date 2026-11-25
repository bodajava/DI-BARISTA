import { Controller, Get, Header, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { AuditService } from '../audit/audit.service';
import { ProductService } from '../product/product.service';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';
import { CustomersService } from './customers.service';
import { AuditQueryDto, CustomersQueryDto, ExportQueryDto, RangeQueryDto } from './dto';

@Controller('admin/analytics')
@UseGuards(AuthGuard, RolesGuard)
@Roles(...STAFF_ROLES)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@Query() query: RangeQueryDto) {
    return this.analytics.overview(query);
  }

  @Get('sales-trend')
  salesTrend(@Query() query: RangeQueryDto) {
    return this.analytics.salesTrend(query);
  }

  @Get('products-performance')
  productsPerformance(@Query() query: RangeQueryDto) {
    return this.analytics.productsPerformance(query);
  }

  @Get('top-products')
  topProducts(@Query() query: RangeQueryDto) {
    return this.analytics.topProducts(query);
  }

  @Get('insights')
  insights(@Query() query: RangeQueryDto) {
    return this.analytics.insights(query);
  }

  @Get('breakdown')
  breakdown(@Query() query: RangeQueryDto) {
    return this.analytics.breakdown(query);
  }

  @Get('customers')
  customers(@Query() query: RangeQueryDto) {
    return this.analytics.customers(query);
  }
}

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly customers: CustomersService,
    private readonly products: ProductService,
    private readonly audit: AuditService,
  ) {}

  @Get('queue')
  @Roles(...STAFF_ROLES)
  queue() {
    return this.admin.queue();
  }

  @Get('inventory/low-stock')
  @Roles(...STAFF_ROLES)
  lowStock() {
    return this.products.findLowStock(50);
  }

  @Get('customers')
  @Roles(...STAFF_ROLES)
  listCustomers(@Query() query: CustomersQueryDto) {
    return this.customers.list(query.search, query.page, query.limit);
  }

  @Get('customers/:identifier')
  @Roles(...STAFF_ROLES)
  customer(@Param('identifier') identifier: string) {
    return this.customers.detail(decodeURIComponent(identifier));
  }

  @Get('audit-logs')
  @Roles(...ADMIN_ROLES)
  auditLogs(@Query() query: AuditQueryDto) {
    return this.audit.list(query.page, query.limit, query.entity);
  }

  @Get('reports/export')
  @Roles(...ADMIN_ROLES)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Query() query: ExportQueryDto, @Res() res: Response) {
    const csv = await this.admin.exportCsv(query.type, query.fromDate, query.toDate);
    res.setHeader('Content-Disposition', `attachment; filename="${query.type}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}
