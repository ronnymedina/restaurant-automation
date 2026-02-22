import { Injectable } from '@nestjs/common';
import { Restaurant } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateRestaurantData {
  name: string;
  slug: string;
}

@Injectable()
export class RestaurantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRestaurantData): Promise<Restaurant> {
    return this.prisma.restaurant.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
    });
  }

  async findBySlug(slug: string): Promise<Restaurant | null> {
    return this.prisma.restaurant.findUnique({
      where: { slug },
    });
  }

  async findById(id: string): Promise<Restaurant | null> {
    return this.prisma.restaurant.findUnique({
      where: { id },
    });
  }

  async findByIdWithRelations(id: string): Promise<Restaurant | null> {
    return this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        products: true,
        categories: true,
        menus: true,
      },
    });
  }

  async findAll(): Promise<Restaurant[]> {
    return this.prisma.restaurant.findMany();
  }

  async update(
    id: string,
    data: Partial<CreateRestaurantData>,
  ): Promise<Restaurant> {
    return this.prisma.restaurant.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Restaurant> {
    return this.prisma.restaurant.delete({
      where: { id },
    });
  }
}
