import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CartRepository,
  ProductRepository,
} from '../../models/repositories';
import {
  Cart,
  CartSchema,
  Product,
  ProductSchema,
} from '../../models/schemas';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CartController],
  providers: [CartService, CartRepository, ProductRepository],
  exports: [CartService, CartRepository],
})
export class CartModule {}

