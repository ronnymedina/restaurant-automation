import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Prisma, Product, Category } from '@prisma/client';

import { ProductRepository, CreateProductData } from './product.repository';
import { CategoryRepository } from './category.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { EntityNotFoundException } from '../common/exceptions';
import { InsufficientStockException } from './exceptions/products.exceptions';
import { ProductEventsService } from '../events/products.events';
import { DEFAULT_CATEGORY_NAME } from '../config';

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock?: number | null;
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
    private readonly productEventsService: ProductEventsService,
  ) {
    this.batchSize = this.configService.batchSize;
  }

  /**
   * Creates or retrieves the default category for a restaurant.
   * This is the single entry point for getting the default category.
   */
  async getOrCreateDefaultCategory(
    restaurantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Category> {
    return this.categoryRepository.findOrCreate({ name: DEFAULT_CATEGORY_NAME, restaurantId }, tx);
  }

  async createProduct(
    restaurantId: string,
    data: ProductInput,
    categoryId: string,
  ): Promise<Product> {
    const product = await this.productRepository.create({
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      imageUrl: data.imageUrl,
      restaurantId,
      categoryId,
    });
    this.productEventsService.emitProductCreated(restaurantId);
    return product;
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
    await this.findById(id, restaurantId);
    const product = await this.productRepository.update(id, restaurantId, data);
    this.productEventsService.emitProductUpdated(restaurantId);
    return product;
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
    if (product.stock === null) return product; // infinite stock
    if (product.stock < amount) {
      throw new InsufficientStockException(product.name, product.stock, amount);
    }
    return this.productRepository.update(productId, restaurantId, {
      stock: product.stock - amount,
    });
  }

  async deleteProduct(id: string, restaurantId: string): Promise<Product> {
    await this.findById(id, restaurantId);
    const product = await this.productRepository.delete(id, restaurantId);
    this.productEventsService.emitProductDeleted(restaurantId);
    return product;
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
        price: 5.99,
        restaurantId,
        categoryId,
      },
      {
        name: 'Producto Demo 2',
        description: 'Este es un producto de demostración',
        price: 8.50,
        restaurantId,
        categoryId,
      },
      {
        name: 'Producto Demo 3',
        description: 'Este es un producto de demostración',
        price: 12.00,
        restaurantId,
        categoryId,
      },
    ];

    return this.productRepository.createMany(demoProducts);
  }
}
