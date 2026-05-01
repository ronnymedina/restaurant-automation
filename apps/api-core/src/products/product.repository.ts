import { Injectable } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

import { PrismaService } from '../prisma/prisma.service';
import { EntityNotFoundException } from '../common/exceptions';

export interface CreateProductData {
  name: string;
  description?: string;
  price: bigint;
  stock?: number | null;
  active?: boolean;
  sku?: string;
  imageUrl?: string | null;
  restaurantId: string;
  categoryId: string;
}

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(data: CreateProductData): Promise<Product> {
    return this.prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        stock: data.stock ?? null,
        active: data.active ?? true,
        sku: data.sku,
        imageUrl: data.imageUrl,
        restaurantId: data.restaurantId,
        categoryId: data.categoryId,
      },
    });
  }

  async createMany(products: CreateProductData[]): Promise<number> {
    const result = await this.prisma.product.createMany({
      data: products.map((p) => ({
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock ?? null,
        active: p.active ?? true,
        sku: p.sku,
        imageUrl: p.imageUrl,
        restaurantId: p.restaurantId,
        categoryId: p.categoryId,
      })),
    });

    return result.count;
  }

  async findById(id: string, restaurantId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null },
    });
  }

  async findByRestaurantId(restaurantId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
    search?: string,
  ): Promise<{ data: Product[]; total: number }> {
    const where = {
      restaurantId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { sku:  { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { category: { select: { name: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total };
  }

  async findAll(): Promise<Product[]> {
    return this.prisma.product.findMany();
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Omit<CreateProductData, 'restaurantId' | 'categoryId'>> & { categoryId?: string },
  ): Promise<Product> {
    await this.findProductAndThrowIfNotFound(id, restaurantId);

    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, restaurantId: string): Promise<Product> {
    await this.findProductAndThrowIfNotFound(id, restaurantId);

    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findProductAndThrowIfNotFound(
    id: string,
    restaurantId: string,
  ): Promise<Product> {
    const product = await this.findById(id, restaurantId);
    if (!product) {
      throw new EntityNotFoundException('Product', id);
    }

    return product;
  }

  async countByCategoryId(categoryId: string, restaurantId: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId, restaurantId },
    });
  }

  async reassignCategory(
    fromCategoryId: string,
    toCategoryId: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.product.updateMany({
      where: { categoryId: fromCategoryId, restaurantId },
      data: { categoryId: toCategoryId },
    });
    return result.count;
  }
}
