import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from '../schemas';
import { BaseRepository } from './base.repository';

@Injectable()
export class CartRepository extends BaseRepository<CartDocument> {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
  ) {
    super(cartModel);
  }

  async findActiveCart(options: {
    userId?: string;
    guestSessionId?: string;
  }): Promise<CartDocument | null> {
    if (options.userId && Types.ObjectId.isValid(options.userId)) {
      const userCart = await this.findOne(
        { userId: new Types.ObjectId(options.userId) },
        { populate: [{ path: 'items.productId' }] },
      );
      if (userCart) return userCart;
    }

    if (options.guestSessionId) {
      return this.findOne(
        { guestSessionId: options.guestSessionId.trim() },
        { populate: [{ path: 'items.productId' }] },
      );
    }

    return null;
  }
}
