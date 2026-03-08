import { Injectable, Optional } from '@nestjs/common';
import { Menu } from '@prisma/client';

import { MenuRepository, CreateMenuData } from './menu.repository';
import { MenuNotFoundException } from './exceptions/menus.exceptions';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class MenusService {
  constructor(
    private readonly menuRepository: MenuRepository,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) { }

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
    const menu = await this.menuRepository.create({ ...data, restaurantId });
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menu', action: 'created' });
    return menu;
  }

  async updateMenu(
    id: string,
    restaurantId: string,
    data: Partial<CreateMenuData>,
  ): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    const menu = await this.menuRepository.update(id, data);
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menu', action: 'updated' });
    return menu;
  }

  async deleteMenu(id: string, restaurantId: string): Promise<Menu> {
    await this.findMenuAndThrowIfNotFound(id, restaurantId);
    const menu = await this.menuRepository.delete(id);
    this.eventsGateway?.emitToKiosk(restaurantId, 'catalog:changed', { type: 'menu', action: 'deleted' });
    return menu;
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
