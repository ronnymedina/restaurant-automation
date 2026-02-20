import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Category } from '@prisma/client';

import { CategoryRepository, CreateCategoryData } from './category.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  EntityNotFoundException,
} from '../common/exceptions';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    @Inject(productConfig.KEY)
    private readonly configService: ConfigType<typeof productConfig>,
  ) { }

  async findByRestaurantId(restaurantId: string): Promise<Category[]> {
    return this.categoryRepository.findByRestaurantId(restaurantId);
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Category>> {
    const currentPage = page || 1;
    const currentLimit = limit || this.configService.defaultPageSize;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } =
      await this.categoryRepository.findByRestaurantIdPaginated(
        restaurantId,
        skip,
        currentLimit,
      );

    return {
      data,
      meta: {
        total,
        page: currentPage,
        limit: currentLimit,
        totalPages: Math.ceil(total / currentLimit),
      },
    };
  }

  async createCategory(restaurantId: string, name: string): Promise<Category> {
    return this.categoryRepository.create({ name, restaurantId });
  }

  async updateCategory(
    id: string,
    restaurantId: string,
    data: Partial<CreateCategoryData>,
  ): Promise<Category> {
    await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    return this.categoryRepository.update(id, restaurantId, data);
  }

  async deleteCategory(id: string, restaurantId: string): Promise<Category> {
    await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    return this.categoryRepository.delete(id, restaurantId);
  }



  async findCategoryAndThrowIfNotFound(id: string, restaurantId: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id, restaurantId);

    if (!category) {
      throw new EntityNotFoundException('Category', id);
    }
    return category;
  }

}
