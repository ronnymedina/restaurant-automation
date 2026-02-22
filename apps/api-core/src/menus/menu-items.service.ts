import { Injectable } from '@nestjs/common';
import { MenuItem } from '@prisma/client';

import { MenuItemRepository, CreateMenuItemData } from './menu-item.repository';

@Injectable()
export class MenuItemsService {
  constructor(private readonly menuItemRepository: MenuItemRepository) {}

  async createItem(
    menuId: string,
    data: Omit<CreateMenuItemData, 'menuId'>,
  ): Promise<MenuItem> {
    if (data.order === undefined) {
      const maxOrder = await this.menuItemRepository.getMaxOrder(
        menuId,
        data.sectionName ?? '',
      );
      data.order = maxOrder + 1;
    }
    return this.menuItemRepository.create({ ...data, menuId });
  }

  async bulkCreateItems(
    menuId: string,
    productIds: string[],
    sectionName: string,
  ): Promise<number> {
    const maxOrder = await this.menuItemRepository.getMaxOrder(
      menuId,
      sectionName,
    );
    const items: CreateMenuItemData[] = productIds.map((productId, index) => ({
      menuId,
      productId,
      sectionName,
      order: maxOrder + 1 + index,
    }));
    return this.menuItemRepository.createMany(items);
  }

  async updateItem(
    itemId: string,
    data: Partial<Omit<CreateMenuItemData, 'menuId' | 'productId'>>,
  ): Promise<MenuItem> {
    return this.menuItemRepository.update(itemId, data);
  }

  async deleteItem(itemId: string): Promise<MenuItem> {
    return this.menuItemRepository.delete(itemId);
  }
}
