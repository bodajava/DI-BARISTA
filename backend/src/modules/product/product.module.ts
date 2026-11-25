import { Module } from '@nestjs/common';
import { ProductController, VariantController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  controllers: [ProductController, VariantController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
