import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateCategoryData {
  name: string;
  restaurantId: string;
}

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(data: CreateCategoryData): Promise<Category> {
    return this.prisma.category.create({
      data: {
        name: data.name,
        restaurantId: data.restaurantId,
      },
    });
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
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
  ): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: {
        name,
        restaurantId,
      },
    });
  }

  async findOrCreate(data: CreateCategoryData): Promise<Category> {
    const existing = await this.findByNameAndRestaurant(
      data.name,
      data.restaurantId,
    );
    if (existing) {
      return existing;
    }
    return this.create(data);
  }

  async update(id: string, data: Partial<CreateCategoryData>): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Category> {
    return this.prisma.category.delete({ where: { id } });
  }
}
