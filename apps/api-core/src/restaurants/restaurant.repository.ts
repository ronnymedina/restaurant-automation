import { Injectable } from '@nestjs/common';
import { Prisma, Restaurant } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type RestaurantWithSettings = Prisma.RestaurantGetPayload<{
  include: { settings: true };
}>;

export interface CreateRestaurantData {
  name: string;
  slug: string;
}

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class RestaurantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRestaurantData, tx?: TransactionClient): Promise<Restaurant> {
    const client = tx ?? this.prisma;
    return client.restaurant.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
    });
  }

  async findBySlug(slug: string, tx?: TransactionClient): Promise<Restaurant | null> {
    const client = tx ?? this.prisma;
    return client.restaurant.findUnique({
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
        productCategories: true,
        menus: true,
      },
    });
  }

  async findAll(): Promise<Restaurant[]> {
    return this.prisma.restaurant.findMany();
  }

  async update(
    id: string,
    data: Prisma.RestaurantUpdateInput,
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

  async findBySlugWithSettings(slug: string, tx?: TransactionClient): Promise<RestaurantWithSettings | null> {
    const client = tx ?? this.prisma;
    return client.restaurant.findUnique({
      where: { slug },
      include: { settings: true },
    });
  }

  async findByIdWithSettings(id: string): Promise<RestaurantWithSettings | null> {
    return this.prisma.restaurant.findUnique({
      where: { id },
      include: { settings: true },
    });
  }

  async upsertSettings(
    restaurantId: string,
    data: { kitchenToken?: string; kitchenTokenExpiresAt?: Date },
  ) {
    return this.prisma.restaurantSettings.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });
  }
}
