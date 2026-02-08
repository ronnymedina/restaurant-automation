import { Injectable } from '@nestjs/common';
import { Product } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateProductData {
  name: string;
  description?: string;
  price?: number;
  stock?: number;
  active?: boolean;
  sku?: string;
  imageUrl?: string;
  restaurantId: string;
  categoryId?: string;
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
        price: p.price ?? 0,
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

  async findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { id },
    });
  }

  async findByRestaurantId(restaurantId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { restaurantId },
    });
  }

  async findAll(): Promise<Product[]> {
    return this.prisma.product.findMany();
  }

  async update(id: string, data: Partial<CreateProductData>): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Product> {
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
