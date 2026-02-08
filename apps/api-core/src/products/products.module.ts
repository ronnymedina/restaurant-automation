import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductRepository } from './product.repository';
import { CategoryRepository } from './category.repository';

@Module({
  providers: [ProductsService, ProductRepository, CategoryRepository],
  exports: [ProductsService, ProductRepository, CategoryRepository],
})
export class ProductsModule {}
