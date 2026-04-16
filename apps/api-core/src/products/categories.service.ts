import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Prisma, ProductCategory } from '@prisma/client';

import { ProductCategoryRepository, CreateProductCategoryData } from './product-category.repository';
import { ProductRepository } from './product.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  EntityNotFoundException,
  DefaultCategoryProtectedException,
  CategoryHasProductsException,
  ValidationException,
  DuplicateEntityException,
} from '../common/exceptions';
import { ProductEventsService } from '../events/products.events';
import { PrismaService } from '../prisma/prisma.service';

export interface DeleteCategoryOptions {
  reassignTo?: string;
}

export interface CheckDeleteResult {
  productsCount: number;
  isDefault: boolean;
  canDeleteDirectly: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: ProductCategoryRepository,
    private readonly productRepository: ProductRepository,
    @Inject(productConfig.KEY)
    private readonly configService: ConfigType<typeof productConfig>,
    private readonly productEventsService: ProductEventsService,
    private readonly prisma: PrismaService,
  ) {}

  async findByRestaurantId(restaurantId: string): Promise<ProductCategory[]> {
    return this.categoryRepository.findByRestaurantId(restaurantId);
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<ProductCategory>> {
    const currentPage = page || 1;
    const currentLimit = limit
      ? Math.min(limit, this.configService.maxPageSize)
      : this.configService.maxPageSize;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } = await this.categoryRepository.findByRestaurantIdPaginated(
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

  async createCategory(restaurantId: string, name: string): Promise<ProductCategory> {
    try {
      const category = await this.categoryRepository.create({ name, restaurantId });
      this.productEventsService.emitCategoryCreated(restaurantId);
      return category;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateEntityException('ProductCategory', 'name', name);
      }
      throw err;
    }
  }

  async updateCategory(
    id: string,
    restaurantId: string,
    data: Partial<Pick<CreateProductCategoryData, 'name'>>,
  ): Promise<ProductCategory> {
    const category = await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    if (category.isDefault) throw new DefaultCategoryProtectedException();
    const updated = await this.categoryRepository.update(id, restaurantId, data);
    this.productEventsService.emitCategoryUpdated(restaurantId);
    return updated;
  }

  async checkDelete(id: string, restaurantId: string): Promise<CheckDeleteResult> {
    const category = await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    const productsCount = await this.productRepository.countByCategoryId(id, restaurantId);
    return {
      productsCount,
      isDefault: category.isDefault,
      canDeleteDirectly: productsCount === 0 && !category.isDefault,
    };
  }

  async deleteCategory(
    id: string,
    restaurantId: string,
    options: DeleteCategoryOptions,
  ): Promise<ProductCategory> {
    // Guard: default categories are protected
    const category = await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    if (category.isDefault) throw new DefaultCategoryProtectedException();

    // Guard: reassignTo cannot point to itself
    if (options.reassignTo && options.reassignTo === id) {
      throw new ValidationException('reassignTo cannot be the same as the category being deleted');
    }

    // Guard: if reassignTo is provided, validate target exists and belongs to this restaurant
    if (options.reassignTo) {
      const targetCategory = await this.categoryRepository.findById(options.reassignTo, restaurantId);
      if (!targetCategory) {
        throw new EntityNotFoundException('ProductCategory', options.reassignTo);
      }
    }

    // Guard: if products exist, reassignTo is required
    const productsCount = await this.productRepository.countByCategoryId(id, restaurantId);
    if (productsCount > 0 && !options.reassignTo) {
      throw new CategoryHasProductsException(productsCount);
    }

    // Execute: reassign then delete atomically
    return this.prisma.$transaction(async (tx) => {
      if (productsCount > 0 && options.reassignTo) {
        await this.productRepository.reassignCategory(id, options.reassignTo, restaurantId, tx);
      }
      const deleted = await this.categoryRepository.delete(id, restaurantId, tx);
      this.productEventsService.emitCategoryDeleted(restaurantId);
      return deleted;
    });
  }

  async findCategoryAndThrowIfNotFound(id: string, restaurantId: string): Promise<ProductCategory> {
    const category = await this.categoryRepository.findById(id, restaurantId);
    if (!category) throw new EntityNotFoundException('ProductCategory', id);
    return category;
  }
}
