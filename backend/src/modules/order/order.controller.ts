import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  GuestSession,
  Public,
  RateLimit,
  Roles,
} from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IJwtPayload, IPaginatedResult } from '../../common/interfaces';
import { ParseMongoIdPipe } from '../../common/pipes';
import {
  CreateCheckoutOrderDto,
  QueryOrdersDto,
  RefundOrderDto,
  UpdateOrderStatusDto,
} from './dto';
import { OrderEntity } from './entities/order.entity';
import { OrderService } from './order.service';

@Controller('orders')
@UseGuards(AuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * Public/Authenticated Checkout Endpoint
   */
  @Public()
  @RateLimit({ limit: 10, windowSeconds: 10 * 60 })
  @Post('checkout')
  async checkout(
    @Body() dto: CreateCheckoutOrderDto,
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ) {
    return this.orderService.createCheckoutOrder(dto, user, guestSessionId);
  }

  /**
   * Public Order Tracking Endpoint
   */
  @Public()
  @RateLimit({ limit: 20, windowSeconds: 10 * 60 })
  @Get('track/:orderNumber')
  async trackOrder(
    @Param('orderNumber') orderNumber: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('contact') contact?: string,
  ): Promise<Partial<OrderEntity>> {
    return this.orderService.trackOrder(orderNumber, email, phone, contact);
  }

  /**
   * Authenticated Customer Order History
   */
  @Get('my-orders')
  async getMyOrders(
    @CurrentUser() user: IJwtPayload,
    @Query() query: QueryOrdersDto,
  ): Promise<IPaginatedResult<OrderEntity>> {
    return this.orderService.findMyOrders(user, query);
  }

  /**
   * Staff: Paginated List of All Orders
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BARISTA)
  async findAll(
    @Query() query: QueryOrdersDto,
  ): Promise<IPaginatedResult<OrderEntity>> {
    return this.orderService.findAllForStaff(query);
  }

  /**
   * Staff: Full Order Details by ID
   */
  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BARISTA)
  async findOne(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<OrderEntity> {
    return this.orderService.findByIdForStaff(id);
  }

  /**
   * Staff: Update Order Status
   */
  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BARISTA)
  async updateStatus(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() staff: IJwtPayload,
  ): Promise<OrderEntity> {
    return this.orderService.updateStatusByStaff(id, dto, staff.sub, staff.role);
  }

  /**
   * Admin: Refund a PAID Order & Restore Inventory
   * Supports order MongoDB _id or orderNumber (DIB-XXXXXX-XXXX)
   */
  @Patch(':id/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async refundOrder(
    @Param('id') idOrOrderNumber: string,
    @Body() body?: RefundOrderDto,
    @CurrentUser('sub') staffUserId?: string,
  ): Promise<OrderEntity> {
    return this.orderService.refundOrder(
      idOrOrderNumber,
      body?.reason,
      staffUserId,
    );
  }
}

