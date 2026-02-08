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
    return this.restaurantRepository.create({ name });
  }

  async findById(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findById(id);
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
}
