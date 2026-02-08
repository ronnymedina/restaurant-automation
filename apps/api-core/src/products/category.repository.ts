import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Category } from '@prisma/client';

export interface CreateCategoryData {
  name: string;
  restaurantId: string;
}

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

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
}
