import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from '@prisma/client';
import { ProductRepository, CreateProductData } from './product.repository';
import { CategoryRepository } from './category.repository';

export interface ProductInput {
  name: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
  imageUrl?: string;
}

@Injectable()
export class ProductsService {
  private readonly batchSize: number;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('BATCH_SIZE', 10);
  }

  async createProduct(
    restaurantId: string,
    data: ProductInput,
  ): Promise<Product> {
    let categoryId: string | undefined;

    if (data.category) {
      const category = await this.categoryRepository.findOrCreate({
        name: data.category,
        restaurantId,
      });
      categoryId = category.id;
    }

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

  async createProductsBatch(
    restaurantId: string,
    products: ProductInput[],
  ): Promise<{ totalCreated: number; batches: number }> {
    let totalCreated = 0;
    let batches = 0;

    // Process products in batches
    for (let i = 0; i < products.length; i += this.batchSize) {
      const batch = products.slice(i, i + this.batchSize);

      // Resolve categories for the batch
      const productsWithCategories: CreateProductData[] = await Promise.all(
        batch.map(async (product) => {
          let categoryId: string | undefined;

          if (product.category) {
            const category = await this.categoryRepository.findOrCreate({
              name: product.category,
              restaurantId,
            });
            categoryId = category.id;
          }

          return {
            name: product.name,
            description: product.description,
            price: product.price,
            stock: product.stock,
            imageUrl: product.imageUrl,
            restaurantId,
            categoryId,
          };
        }),
      );

      const created = await this.productRepository.createMany(
        productsWithCategories,
      );
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

  async createDemoProducts(restaurantId: string): Promise<number> {
    // Get or create the 'default' category for demo products
    const defaultCategory = await this.categoryRepository.findOrCreate({
      name: 'default',
      restaurantId,
    });

    const demoProducts: CreateProductData[] = [
      {
        name: 'Producto Demo 1',
        description: 'Este es un producto de demostración',
        price: 0,
        restaurantId,
        categoryId: defaultCategory.id,
      },
      {
        name: 'Producto Demo 2',
        description: 'Este es un producto de demostración',
        price: 0,
        restaurantId,
        categoryId: defaultCategory.id,
      },
      {
        name: 'Producto Demo 3',
        description: 'Este es un producto de demostración',
        price: 0,
        restaurantId,
        categoryId: defaultCategory.id,
      },
    ];

    return this.productRepository.createMany(demoProducts);
  }
}
