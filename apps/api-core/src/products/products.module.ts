import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProductsService } from './products.service';
import { ProductRepository } from './product.repository';
import { CategoryRepository } from './category.repository';

import { productConfig } from './product.config';

@Module({
  imports: [ConfigModule.forFeature(productConfig)],
  providers: [ProductsService, ProductRepository, CategoryRepository],
  exports: [ProductsService, ProductRepository, CategoryRepository],
})
export class ProductsModule { }
