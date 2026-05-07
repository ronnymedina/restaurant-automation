import { Injectable } from '@nestjs/common';
import { Prisma, Restaurant } from '@prisma/client';
import { RestaurantRepository, RestaurantWithSettings } from './restaurant.repository';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class RestaurantsService {
  constructor(private readonly restaurantRepository: RestaurantRepository) {}

  async createRestaurant(name: string, timezone = 'UTC', tx?: TransactionClient): Promise<Restaurant> {
    const slug = await this.generateSlug(name, tx);
    return this.restaurantRepository.createWithSettings({ name, slug, timezone }, tx);
  }

  async findById(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findById(id);
  }

  async findBySlug(slug: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findBySlug(slug);
  }

  async findByIdWithDetails(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findByIdWithRelations(id);
  }

  async findAll(): Promise<Restaurant[]> {
    return this.restaurantRepository.findAll();
  }

  async update(
    id: string,
    data: Prisma.RestaurantUpdateInput,
  ): Promise<Restaurant> {
    return this.restaurantRepository.update(id, data);
  }

  async delete(id: string): Promise<Restaurant> {
    return this.restaurantRepository.delete(id);
  }

  async rename(id: string, name: string): Promise<Restaurant> {
    return this.restaurantRepository.update(id, { name });
  }

  async findBySlugWithSettings(slug: string): Promise<RestaurantWithSettings | null> {
    return this.restaurantRepository.findBySlugWithSettings(slug);
  }

  async findByIdWithSettings(id: string): Promise<RestaurantWithSettings | null> {
    return this.restaurantRepository.findByIdWithSettings(id);
  }

  async upsertSettings(
    restaurantId: string,
    data: { kitchenToken?: string; kitchenTokenExpiresAt?: Date },
  ) {
    return this.restaurantRepository.upsertSettings(restaurantId, data);
  }

  private async generateSlug(name: string, tx?: TransactionClient): Promise<string> {
    const base = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = base;
    let existing = await this.restaurantRepository.findBySlug(slug, tx);
    while (existing) {
      const suffix = Math.random().toString(36).substring(2, 6);
      slug = `${base}-${suffix}`;
      existing = await this.restaurantRepository.findBySlug(slug, tx);
    }
    return slug;
  }
}
