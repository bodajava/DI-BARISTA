import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  GuestSession,
  Public,
} from '../../common/decorators';
import { AuthGuard } from '../../common/guards';
import { IJwtPayload } from '../../common/interfaces';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { CartEntity } from './entities/cart.entity';

@Controller('cart')
@UseGuards(AuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Public()
  @Get()
  async getCart(
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ): Promise<CartEntity> {
    return this.cartService.getActiveCart(user, guestSessionId);
  }

  @Public()
  @Post('items')
  async addItem(
    @Body() dto: AddToCartDto,
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ): Promise<CartEntity> {
    return this.cartService.addItem(dto, user, guestSessionId);
  }

  @Public()
  @Patch('items/:itemId')
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ): Promise<CartEntity> {
    return this.cartService.updateItemQuantity(
      itemId,
      dto,
      user,
      guestSessionId,
    );
  }

  @Public()
  @Delete('items/:itemId')
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ): Promise<CartEntity> {
    return this.cartService.removeItem(itemId, user, guestSessionId);
  }

  @Public()
  @Delete()
  async clearCart(
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ): Promise<{ message: string }> {
    return this.cartService.clearCart(user, guestSessionId);
  }
}

