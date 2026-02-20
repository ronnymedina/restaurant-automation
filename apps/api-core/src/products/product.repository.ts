import { Injectable } from '@nestjs/common';
import { Product } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EntityNotFoundException } from '../common/exceptions';

export interface CreateProductData {
  name: string;
  description?: string;
  price?: number;
  stock?: number;
  active?: boolean;
  sku?: string;
  imageUrl?: string;
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
        price: data.price ?? 0,
        stock: data.stock ?? 0,
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
        stock: p.stock ?? 0,
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
      where: { id, restaurantId },
    });
  }

  async findByRestaurantId(restaurantId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { restaurantId },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: Product[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      this.prisma.product.count({
        where: { restaurantId },
      }),
    ]);
    return { data, total };
  }

  async findAll(): Promise<Product[]> {
    return this.prisma.product.findMany();
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<CreateProductData>,
  ): Promise<Product> {
    await this.findProductAndThrowIfNotFound(id, restaurantId);

    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, restaurantId: string): Promise<Product> {
    await this.findProductAndThrowIfNotFound(id, restaurantId);

    return this.prisma.product.delete({
      where: { id },
    });
  }

  async findProductAndThrowIfNotFound(id: string, restaurantId: string): Promise<Product> {
    const product = await this.findById(id, restaurantId);
    if (!product) {
      throw new EntityNotFoundException('Product', id);
    }

    return product;
  }
}
