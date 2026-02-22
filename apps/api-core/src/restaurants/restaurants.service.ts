import { Injectable } from '@nestjs/common';
import { Restaurant } from '@prisma/client';
import {
  RestaurantRepository,
  CreateRestaurantData,
} from './restaurant.repository';

@Injectable()
export class RestaurantsService {
  constructor(private readonly restaurantRepository: RestaurantRepository) {}

  async createRestaurant(name: string): Promise<Restaurant> {
    const slug = await this.generateSlug(name);
    return this.restaurantRepository.create({ name, slug });
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
    data: Partial<CreateRestaurantData>,
  ): Promise<Restaurant> {
    return this.restaurantRepository.update(id, data);
  }

  async delete(id: string): Promise<Restaurant> {
    return this.restaurantRepository.delete(id);
  }

  private async generateSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = base;
    let existing = await this.restaurantRepository.findBySlug(slug);
    while (existing) {
      const suffix = Math.random().toString(36).substring(2, 6);
      slug = `${base}-${suffix}`;
      existing = await this.restaurantRepository.findBySlug(slug);
    }
    return slug;
  }
}
