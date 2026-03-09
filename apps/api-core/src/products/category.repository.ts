import { Injectable } from '@nestjs/common';
import { Prisma, Category } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

export interface CreateCategoryData {
  name: string;
  restaurantId: string;
}

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(data: CreateCategoryData, tx?: TransactionClient): Promise<Category> {
    const client = tx ?? this.prisma;
    return client.category.create({
      data: {
        name: data.name,
        restaurantId: data.restaurantId,
      },
    });
  }

  async findById(id: string, restaurantId: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id, restaurantId },
    });
  }

  async findByRestaurantId(restaurantId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { restaurantId },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: Category[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count({
        where: { restaurantId },
      }),
    ]);
    return { data, total };
  }

  async findByNameAndRestaurant(
    name: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<Category | null> {
    const client = tx ?? this.prisma;
    return client.category.findFirst({
      where: { name, restaurantId },
    });
  }

  async findOrCreate(data: CreateCategoryData, tx?: TransactionClient): Promise<Category> {
    const existing = await this.findByNameAndRestaurant(data.name, data.restaurantId, tx);
    if (existing) return existing;
    return this.create(data, tx);
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<CreateCategoryData>,
  ): Promise<Category> {
    return this.prisma.category.update({ where: { id, restaurantId }, data });
  }

  async delete(id: string, restaurantId: string): Promise<Category> {
    return this.prisma.category.delete({ where: { id, restaurantId } });
  }
}
