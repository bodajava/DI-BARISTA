import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../schemas';
import { BaseRepository } from './base.repository';

@Injectable()
export class ProductRepository extends BaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {
    super(productModel);
  }

  async findBySlug(slug: string): Promise<ProductDocument | null> {
    return this.findOne(
      { slug: slug.toLowerCase().trim() },
      { populate: ['brandId', 'categoryId'] },
    );
  }

  async findBySlugOrId(identifier: string): Promise<ProductDocument | null> {
    const isObjectId = Types.ObjectId.isValid(identifier);
    const filter: FilterQuery<ProductDocument> = isObjectId
      ? { _id: identifier, deletedAt: null }
      : { slug: identifier.toLowerCase().trim(), deletedAt: null };

    return this.productModel
      .findOne(filter)
      .populate(['brandId', 'categoryId'])
      .exec();
  }

  async findBySku(sku: string): Promise<ProductDocument | null> {
    return this.findOne({ sku: sku.toUpperCase().trim() });
  }

  async findAndIncrementViews(
    identifier: string,
  ): Promise<ProductDocument | null> {
    const isObjectId = Types.ObjectId.isValid(identifier);
    const filter: FilterQuery<ProductDocument> = isObjectId
      ? { _id: identifier, deletedAt: null }
      : { slug: identifier.toLowerCase().trim(), deletedAt: null };

    return this.productModel
      .findOneAndUpdate(
        filter,
        { $inc: { viewsCount: 1 } },
        { new: true },
      )
      .populate(['brandId', 'categoryId'])
      .exec();
  }

  async decrementStockAtomically(
    productId: string,
    quantity: number,
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findOneAndUpdate(
        {
          _id: productId,
          deletedAt: null,
          isActive: true,
          stock: { $gte: quantity },
        },
        {
          $inc: { stock: -quantity, soldCount: quantity },
        },
        { new: true },
      )
      .exec();
  }

  async incrementStockAtomically(
    productId: string,
    quantity: number,
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findOneAndUpdate(
        {
          _id: productId,
          deletedAt: null,
        },
        [
          {
            $set: {
              stock: { $add: ['$stock', quantity] },
              soldCount: {
                $max: [0, { $subtract: ['$soldCount', quantity] }],
              },
            },
          },
        ],
        { new: true },
      )
      .exec();
  }
}
