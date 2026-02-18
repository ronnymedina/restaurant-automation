import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { ProductRepository } from './product.repository';
import { CategoryRepository } from './category.repository';

import { productConfig } from './product.config';

@Module({
  imports: [ConfigModule.forFeature(productConfig)],
  controllers: [ProductsController, CategoriesController],
  providers: [
    ProductsService,
    CategoriesService,
    ProductRepository,
    CategoryRepository,
  ],
  exports: [
    ProductsService,
    CategoriesService,
    ProductRepository,
    CategoryRepository,
  ],
})
export class ProductsModule {}
