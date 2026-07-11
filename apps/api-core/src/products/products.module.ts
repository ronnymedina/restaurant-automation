import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProductRepository } from './product.repository';
import { ProductsService } from './products.service';

import { ProductCategoryRepository } from './product-category.repository';
import { CategoriesService } from './categories.service';

import { ProductsController } from './products.controller';
import { ProductCategoriesController } from './categories.controller';

import { EventsModule } from '../events/events.module';

import { productConfig } from './product.config';

@Module({
  imports: [ConfigModule.forFeature(productConfig), EventsModule],
  controllers: [ProductsController, ProductCategoriesController],
  providers: [
    ProductRepository,
    ProductCategoryRepository,
    ProductsService,
    CategoriesService,
  ],
  exports: [
    ProductsService,
    CategoriesService,
    ProductRepository,
    ProductCategoryRepository,
  ],
})
export class ProductsModule { }
