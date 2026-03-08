import { Injectable, Optional } from '@nestjs/common';
import { MenuItem } from '@prisma/client';

import { MenuItemRepository, CreateMenuItemData } from './menu-item.repository';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class MenuItemsService {
  constructor(
    private readonly menuItemRepository: MenuItemRepository,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  async createItem(
    menuId: string,
    restaurantId: string,
    data: Omit<CreateMenuItemData, 'menuId'>,
  ): Promise<MenuItem> {
    if (data.order === undefined) {
      const maxOrder = await this.menuItemRepository.getMaxOrder(
        menuId,
        data.sectionName ?? '',
      );
      data.order = maxOrder + 1;
    }
    const item = await this.menuItemRepository.create({ ...data, menuId });
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menuItem', action: 'created' });
    return item;
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
    restaurantId: string,
    data: Partial<Omit<CreateMenuItemData, 'menuId' | 'productId'>>,
  ): Promise<MenuItem> {
    const item = await this.menuItemRepository.update(itemId, data);
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menuItem', action: 'updated' });
    return item;
  }

  async deleteItem(itemId: string, restaurantId: string): Promise<MenuItem> {
    const item = await this.menuItemRepository.delete(itemId);
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menuItem', action: 'deleted' });
    return item;
  }
}
