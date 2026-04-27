import { Injectable } from '@nestjs/common';
import { Menu } from '@prisma/client';

import { MenuRepository, CreateMenuData } from './menu.repository';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { MenuNotFoundException } from './exceptions/menus.exceptions';

@Injectable()
export class MenusService {
  constructor(
    private readonly menuRepository: MenuRepository,
  ) { }

  async findByRestaurantId(restaurantId: string) {
    return this.menuRepository.findByRestaurantId(restaurantId);
  }

  async listMenusPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Awaited<ReturnType<MenuRepository['findByRestaurantId']>>[number]>> {
    const currentPage = page || 1;
    const currentLimit = limit || 50;
    const skip = (currentPage - 1) * currentLimit;
    const { items, total } = await this.menuRepository.findByRestaurantIdPaginated(
      restaurantId,
      skip,
      currentLimit,
    );
    return {
      data: items,
      meta: {
        total,
        page: currentPage,
        limit: currentLimit,
        totalPages: Math.ceil(total / currentLimit),
      },
    };
  }

  async findByIdWithItems(id: string, restaurantId: string) {
    const menu = await this.menuRepository.findByIdWithItems(id, restaurantId);
    if (!menu) throw new MenuNotFoundException(id);
    return menu;
  }

  async createMenu(
    restaurantId: string,
    data: Omit<CreateMenuData, 'restaurantId'>,
  ): Promise<Menu> {
    const menu = await this.menuRepository.create({ ...data, restaurantId });
    return menu;
  }

  async updateMenu(
    id: string,
    restaurantId: string,
    data: Partial<CreateMenuData>,
  ): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    const menu = await this.menuRepository.update(id, data);
    return menu;
  }

  async deleteMenu(id: string, restaurantId: string): Promise<void> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    await this.menuRepository.softDelete(id);
  }
  async verifyOwnership(id: string, restaurantId: string): Promise<Menu> {
    return this.findMenuAndThrowIfNotFound(id, restaurantId);
  }


  async findMenuAndThrowIfNotFound(
    id: string,
    restaurantId: string,
  ): Promise<Menu> {
    const menu = await this.menuRepository.findById(id, restaurantId);
    if (!menu) throw new MenuNotFoundException(id);
    return menu;
  }
}
