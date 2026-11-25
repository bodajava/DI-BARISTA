import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, GuestSession, Public, RateLimit, Roles } from '../../common/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IJwtPayload, IPaginatedResult } from '../../common/interfaces';
import { ParseIdPipe } from '../../common/pipes';
import { CreateCheckoutOrderDto, QueryOrdersDto, RefundOrderDto, UpdateOrderStatusDto } from './dto';
import { OrderEntity } from './entities/order.entity';
import { InvoiceService } from './invoice.service';
import { OrderService } from './order.service';

@Controller('orders')
@UseGuards(AuthGuard, RolesGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly invoices: InvoiceService,
  ) {}

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 10 * 60 })
  @Post('checkout')
  checkout(
    @Body() dto: CreateCheckoutOrderDto,
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ) {
    return this.orderService.createCheckoutOrder(dto, user, guestSessionId);
  }

  @Public()
  @RateLimit({ limit: 20, windowSeconds: 10 * 60 })
  @Get('track/:orderNumber')
  trackOrder(
    @Param('orderNumber') orderNumber: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('contact') contact?: string,
  ) {
    return this.orderService.trackOrder(orderNumber, email, phone, contact);
  }

  @Get('my-orders')
  getMyOrders(@CurrentUser() user: IJwtPayload, @Query() query: QueryOrdersDto): Promise<IPaginatedResult<OrderEntity>> {
    return this.orderService.findMyOrders(user, query);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  findAll(@Query() query: QueryOrdersDto) {
    return this.orderService.findAllForStaff(query);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  findOne(@Param('id', ParseIdPipe) id: string): Promise<OrderEntity> {
    return this.orderService.findByIdForStaff(id);
  }

  @Get(':id/invoice')
  @Roles(...STAFF_ROLES)
  async invoice(@Param('id', ParseIdPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const pdf = await this.invoices.render(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${id}.pdf"`);
    return new StreamableFile(pdf);
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  updateStatus(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() staff: IJwtPayload,
  ): Promise<OrderEntity> {
    return this.orderService.updateStatusByStaff(id, dto, staff.sub, staff.role);
  }

  @Patch(':id/refund')
  @Roles(...ADMIN_ROLES)
  refund(
    @Param('id') idOrOrderNumber: string,
    @Body() dto: RefundOrderDto,
    @CurrentUser('sub') staffUserId: string,
  ): Promise<OrderEntity> {
    return this.orderService.refundOrder(idOrOrderNumber, dto, staffUserId);
  }
}
