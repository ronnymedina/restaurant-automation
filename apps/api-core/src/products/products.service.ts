import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Product, Category } from '@prisma/client';

import { ProductRepository, CreateProductData } from './product.repository';
import { CategoryRepository } from './category.repository';
import { productConfig } from './product.config';

export interface ProductInput {
  name: string;
  description?: string;
  price?: number;
  stock?: number;
  imageUrl?: string;
}

@Injectable()
export class ProductsService {
  private readonly batchSize: number;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    @Inject(productConfig.KEY)
    private readonly configService: ConfigType<typeof productConfig>,
  ) {
    this.batchSize = this.configService.batchSize;
  }

  /**
   * Creates or retrieves the default category for a restaurant.
   * This is the single entry point for getting the default category.
   */
  async getOrCreateDefaultCategory(restaurantId: string): Promise<Category> {
    return this.categoryRepository.findOrCreate({
      name: 'default',
      restaurantId,
    });
  }

  async createProduct(
    restaurantId: string,
    data: ProductInput,
    categoryId?: string,
  ): Promise<Product> {
    return this.productRepository.create({
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      imageUrl: data.imageUrl,
      restaurantId,
      categoryId,
    });
  }

  /**
   * Creates multiple products in batches, all associated with the given category.
   */
  async createProductsBatch(
    restaurantId: string,
    categoryId: string,
    products: ProductInput[],
  ): Promise<{ totalCreated: number; batches: number }> {
    let totalCreated = 0;
    let batches = 0;

    for (let i = 0; i < products.length; i += this.batchSize) {
      const batch = products.slice(i, i + this.batchSize);

      const productsData: CreateProductData[] = batch.map((product) => ({
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        imageUrl: product.imageUrl,
        restaurantId,
        categoryId,
      }));

      const created = await this.productRepository.createMany(productsData);
      totalCreated += created;
      batches++;
    }

    return { totalCreated, batches };
  }

  async findByRestaurantId(restaurantId: string): Promise<Product[]> {
    return this.productRepository.findByRestaurantId(restaurantId);
  }

  async findById(id: string): Promise<Product | null> {
    return this.productRepository.findById(id);
  }

  /**
   * Creates demo products for a restaurant using the provided category ID.
   */
  async createDemoProducts(
    restaurantId: string,
    categoryId: string,
  ): Promise<number> {
    const demoProducts: CreateProductData[] = [
      {
        name: 'Producto Demo 1',
        description: 'Este es un producto de demostración',
        price: 0,
        restaurantId,
        categoryId,
      },
      {
        name: 'Producto Demo 2',
        description: 'Este es un producto de demostración',
        price: 0,
        restaurantId,
        categoryId,
      },
      {
        name: 'Producto Demo 3',
        description: 'Este es un producto de demostración',
        price: 0,
        restaurantId,
        categoryId,
      },
    ];

    return this.productRepository.createMany(demoProducts);
  }
}
