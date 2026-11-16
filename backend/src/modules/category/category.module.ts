import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CategoryRepository,
  ProductRepository,
} from '../../models/repositories';
import {
  Category,
  CategorySchema,
  Product,
  ProductSchema,
} from '../../models/schemas';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CategoryController],
  providers: [CategoryService, CategoryRepository, ProductRepository],
  exports: [CategoryService, CategoryRepository],
})
export class CategoryModule { }
