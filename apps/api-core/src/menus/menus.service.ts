import { Injectable } from '@nestjs/common';
import { Menu } from '@prisma/client';

import { MenuRepository, CreateMenuData } from './menu.repository';
import { MenuNotFoundException } from './exceptions/menus.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';

@Injectable()
export class MenusService {
  constructor(private readonly menuRepository: MenuRepository) {}

  async findByRestaurantId(restaurantId: string) {
    return this.menuRepository.findByRestaurantId(restaurantId);
  }

  async verifyOwnership(menuId: string, restaurantId: string): Promise<Menu> {
    const menu = await this.menuRepository.findById(menuId);
    if (!menu) throw new MenuNotFoundException(menuId);
    if (menu.restaurantId !== restaurantId) throw new ForbiddenAccessException();
    return menu;
  }

  async findByIdWithItems(id: string, restaurantId: string) {
    await this.verifyOwnership(id, restaurantId);
    const menu = await this.menuRepository.findByIdWithItems(id);
    if (!menu) throw new MenuNotFoundException(id);
    return menu;
  }

  async createMenu(restaurantId: string, data: Omit<CreateMenuData, 'restaurantId'>): Promise<Menu> {
    return this.menuRepository.create({ ...data, restaurantId });
  }

  async updateMenu(id: string, restaurantId: string, data: Partial<CreateMenuData>): Promise<Menu> {
    await this.verifyOwnership(id, restaurantId);
    return this.menuRepository.update(id, data);
  }

  async deleteMenu(id: string, restaurantId: string): Promise<Menu> {
    await this.verifyOwnership(id, restaurantId);
    return this.menuRepository.delete(id);
  }
}
