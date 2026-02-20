import { Injectable } from '@nestjs/common';
import { Menu } from '@prisma/client';

import { MenuRepository, CreateMenuData } from './menu.repository';
import { MenuNotFoundException } from './exceptions/menus.exceptions';

@Injectable()
export class MenusService {
  constructor(private readonly menuRepository: MenuRepository) { }

  async findByRestaurantId(restaurantId: string) {
    return this.menuRepository.findByRestaurantId(restaurantId);
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
    return this.menuRepository.create({ ...data, restaurantId });
  }

  async updateMenu(
    id: string,
    restaurantId: string,
    data: Partial<CreateMenuData>,
  ): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    return this.menuRepository.update(id, data);
  }

  async deleteMenu(id: string, restaurantId: string): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    return this.menuRepository.delete(id);
  }

  async findMenuAndThrowIfNotFound(id: string, restaurantId: string): Promise<Menu> {
    const menu = await this.menuRepository.findById(id, restaurantId);
    if (!menu) throw new MenuNotFoundException(id);
    return menu;
  }
}
