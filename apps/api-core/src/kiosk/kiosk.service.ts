import { Injectable } from '@nestjs/common';
import { Restaurant } from '@prisma/client';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { RegisterSessionRepository } from '../register/register-session.repository';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { EntityNotFoundException } from '../common/exceptions';
import { RegisterNotOpenException } from '../orders/exceptions/orders.exceptions';

@Injectable()
export class KioskService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly menuRepository: MenuRepository,
    private readonly ordersService: OrdersService,
    private readonly registerSessionRepository: RegisterSessionRepository,
  ) {}

  async resolveRestaurant(slug: string): Promise<Restaurant> {
    const restaurant = await this.restaurantsService.findBySlug(slug);
    if (!restaurant) {
      throw new EntityNotFoundException('Restaurant', { slug });
    }
    return restaurant;
  }

  async getAvailableMenus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menus = await this.menuRepository.findByRestaurantId(restaurant.id);

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const currentDay = days[now.getDay()];

    return menus.filter((menu) => {
      if (!menu.active) return false;

      // Filter by day
      if (menu.daysOfWeek) {
        const allowedDays = menu.daysOfWeek.split(',').map((d) => d.trim());
        if (!allowedDays.includes(currentDay)) return false;
      }

      // Filter by time
      if (menu.startTime && currentTime < menu.startTime) return false;
      if (menu.endTime && currentTime > menu.endTime) return false;

      return true;
    });
  }

  async getMenuItems(slug: string, menuId: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menu = await this.menuRepository.findByIdWithItems(menuId);

    if (!menu || menu.restaurantId !== restaurant.id) {
      throw new EntityNotFoundException('Menu', menuId);
    }

    // Group by section and add stock status
    const sections: Record<
      string,
      Array<{
        id: string;
        menuItemId: string;
        name: string;
        description: string | null;
        price: number;
        imageUrl: string | null;
        stockStatus: 'available' | 'low_stock' | 'out_of_stock';
        notes?: string;
      }>
    > = {};

    for (const item of menu.items) {
      const sectionName = item.sectionName || 'General';
      if (!sections[sectionName]) sections[sectionName] = [];

      const stock = item.stock !== null ? item.stock : item.product.stock;
      let stockStatus: 'available' | 'low_stock' | 'out_of_stock';
      if (stock <= 0) stockStatus = 'out_of_stock';
      else if (stock <= 3) stockStatus = 'low_stock';
      else stockStatus = 'available';

      const price =
        item.price !== null ? Number(item.price) : Number(item.product.price);

      sections[sectionName].push({
        id: item.product.id,
        menuItemId: item.id,
        name: item.product.name,
        description: item.product.description,
        price,
        imageUrl: item.product.imageUrl,
        stockStatus,
      });
    }

    return { menuId: menu.id, menuName: menu.name, sections };
  }

  async createKioskOrder(slug: string, dto: CreateOrderDto) {
    const restaurant = await this.resolveRestaurant(slug);

    const session = await this.registerSessionRepository.findOpen(
      restaurant.id,
    );
    if (!session) throw new RegisterNotOpenException();

    return this.ordersService.createOrder(restaurant.id, session.id, dto);
  }
}
