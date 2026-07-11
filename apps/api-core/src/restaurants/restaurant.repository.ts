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

  async createWithSettings(
    data: {
      name: string;
      slug: string;
      timezone: string;
      country?: string;
      currency?: string;
      decimalSeparator?: string;
      thousandsSeparator?: string;
    },
    tx?: TransactionClient,
  ): Promise<Restaurant> {
    const run = async (client: TransactionClient) => {
      const restaurant = await client.restaurant.create({
        data: { name: data.name, slug: data.slug },
      });
      await client.restaurantSettings.create({
        data: {
          restaurantId: restaurant.id,
          timezone: data.timezone,
          ...(data.country ? { country: data.country } : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.decimalSeparator ? { decimalSeparator: data.decimalSeparator } : {}),
          ...(data.thousandsSeparator ? { thousandsSeparator: data.thousandsSeparator } : {}),
        },
      });
      return restaurant;
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
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

  count(): Promise<number> {
    return this.prisma.restaurant.count();
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
    data: { kitchenTokenHash?: string; kitchenTokenExpiresAt?: Date },
  ) {
    return this.prisma.restaurantSettings.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });
  }

  async updateWithSettings(
    restaurantId: string,
    data: {
      restaurant: Prisma.RestaurantUpdateInput;
      settings: Prisma.RestaurantSettingsUpdateInput;
    },
  ): Promise<RestaurantWithSettings> {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(data.restaurant).length > 0) {
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: data.restaurant,
        });
      }
      if (Object.keys(data.settings).length > 0) {
        await tx.restaurantSettings.update({
          where: { restaurantId },
          data: data.settings,
        });
      }
      return tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        include: { settings: true },
      });
    });
  }
}
