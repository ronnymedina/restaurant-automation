import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Product, Category } from '@prisma/client';

import { ProductRepository, CreateProductData } from './product.repository';
import { CategoryRepository } from './category.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  EntityNotFoundException,
  ForbiddenAccessException,
  ValidationException,
} from '../common/exceptions';

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
    categoryId: string,
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

  async findByRestaurantIdPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Product>> {
    const currentPage = page || 1;
    const currentLimit = limit || this.configService.defaultPageSize;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } =
      await this.productRepository.findByRestaurantIdPaginated(
        restaurantId,
        skip,
        currentLimit,
      );

    return {
      data,
      meta: {
        total,
        page: currentPage,
        limit: currentLimit,
        totalPages: Math.ceil(total / currentLimit),
      },
    };
  }

  async findById(id: string, restaurantId: string): Promise<Product> {
    const product = await this.productRepository.findById(id, restaurantId);
    if (!product) throw new EntityNotFoundException('Product', id);
    return product;
  }

  async updateProduct(
    id: string,
    restaurantId: string,
    data: Partial<CreateProductData>,
  ): Promise<Product> {
    // Repository now handles checking existence/ownership via restaurantId
    // If we want to be explicit, call findById first to throw standard EntityNotFound
    await this.findById(id, restaurantId);
    return this.productRepository.update(id, restaurantId, data);
  }

  async decrementStock(
    productId: string,
    restaurantId: string,
    amount: number,
  ): Promise<Product> {
    const product = await this.productRepository.findById(
      productId,
      restaurantId,
    );

    if (!product) throw new EntityNotFoundException('Product', productId);
    if (product.stock < amount) {
      throw new ValidationException(
        `Insufficient stock for product '${product.name}'. Available: ${product.stock}, requested: ${amount}`,
      );
    }
    return this.productRepository.update(productId, restaurantId, {
      stock: product.stock - amount,
    });
  }

  async deleteProduct(id: string, restaurantId: string): Promise<Product> {
    await this.findById(id, restaurantId);
    return this.productRepository.delete(id, restaurantId);
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
