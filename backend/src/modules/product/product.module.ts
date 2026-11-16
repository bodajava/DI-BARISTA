import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BrandRepository,
  CategoryRepository,
  ProductRepository,
} from '../../models/repositories';
import {
  Brand,
  BrandSchema,
  Category,
  CategorySchema,
  Product,
  ProductSchema,
} from '../../models/schemas';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductRepository,
    BrandRepository,
    CategoryRepository,
  ],
  exports: [ProductService, ProductRepository],
})
export class ProductModule {}

