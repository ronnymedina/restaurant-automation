import { Injectable } from '@nestjs/common';
import { Prisma, ProductCategory } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

export interface CreateProductCategoryData {
  name: string;
  restaurantId: string;
}

@Injectable()
export class ProductCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateProductCategoryData,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const client = tx ?? this.prisma;
    return client.productCategory.create({
      data: {
        name: data.name,
        restaurantId: data.restaurantId,
      },
    });
  }

  async findById(
    id: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<ProductCategory | null> {
    const client = tx ?? this.prisma;
    return client.productCategory.findUnique({
      where: { id, restaurantId },
    });
  }

  async findByRestaurantId(restaurantId: string): Promise<ProductCategory[]> {
    return this.prisma.productCategory.findMany({
      where: { restaurantId },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: ProductCategory[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.productCategory.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productCategory.count({
        where: { restaurantId },
      }),
    ]);
    return { data, total };
  }

  async findByNameAndRestaurant(
    name: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<ProductCategory | null> {
    const client = tx ?? this.prisma;
    return client.productCategory.findFirst({
      where: { name, restaurantId },
    });
  }

  async findOrCreate(
    data: CreateProductCategoryData,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const existing = await this.findByNameAndRestaurant(
      data.name,
      data.restaurantId,
      tx,
    );
    if (existing) return existing;
    return this.create(data, tx);
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Pick<CreateProductCategoryData, 'name'>>,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const client = tx ?? this.prisma;
    return client.productCategory.update({
      where: { id, restaurantId },
      data,
    });
  }

  async delete(
    id: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const client = tx ?? this.prisma;
    return client.productCategory.delete({ where: { id, restaurantId } });
  }

}
