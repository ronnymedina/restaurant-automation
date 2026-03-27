import { Injectable } from '@nestjs/common';
import { Restaurant } from '@prisma/client';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { CashRegisterSessionRepository } from '../cash-register/cash-register-session.repository';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { EntityNotFoundException } from '../common/exceptions';
import { RegisterNotOpenException } from '../orders/exceptions/orders.exceptions';
import { STOCK_STATUS, StockStatus } from '../events/kiosk.events';
import { TIMEZONE } from '../config';

export interface MenuItemEntry {
  id: string;
  menuItemId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stockStatus: StockStatus;
}

@Injectable()
export class KioskService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly menuRepository: MenuRepository,
    private readonly ordersService: OrdersService,
    private readonly registerSessionRepository: CashRegisterSessionRepository,
  ) {}

  async resolveRestaurant(slug: string): Promise<Restaurant> {
    const restaurant = await this.restaurantsService.findBySlug(slug);
    if (!restaurant) throw new EntityNotFoundException('Restaurant', { slug });
    return restaurant;
  }

  async getAvailableMenus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menus = await this.menuRepository.findByRestaurantId(restaurant.id);
    const { currentDay, currentTime } = this.getCurrentDayAndTime();
    return menus.filter((menu) => this.isMenuAvailable(menu, currentDay, currentTime));
  }

  async getMenuItems(slug: string, menuId: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menu = await this.menuRepository.findByIdWithItems(menuId, restaurant.id);
    if (!menu) throw new EntityNotFoundException('Menu', menuId);
    const sections = this.buildSections(menu.items);
    return { menuId: menu.id, menuName: menu.name, sections };
  }

  async getStatus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    return { registerOpen: !!session };
  }

  async createKioskOrder(slug: string, dto: CreateOrderDto) {
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    if (!session) throw new RegisterNotOpenException();
    return this.ordersService.createOrder(restaurant.id, session.id, dto);
  }

  getCurrentDayAndTime(now = new Date()): { currentDay: string; currentTime: string } {
    const DAY_MAP: Record<string, string> = {
      Mon: 'MON', Tue: 'TUE', Wed: 'WED', Thu: 'THU', Fri: 'FRI', Sat: 'SAT', Sun: 'SUN',
    };

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
    const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
    const minute = parts.find(p => p.type === 'minute')?.value ?? '00';
    // Intl with hour12:false may return "24" for midnight; normalize
    const normalizedHour = hour === '24' ? '00' : hour;

    return {
      currentDay: DAY_MAP[weekday] ?? weekday.toUpperCase().slice(0, 3),
      currentTime: `${normalizedHour}:${minute}`,
    };
  }

  isMenuAvailable(
    menu: { active: boolean; daysOfWeek?: string | null; startTime?: string | null; endTime?: string | null },
    currentDay: string,
    currentTime: string,
  ): boolean {
    if (!menu.active) return false;
    if (menu.daysOfWeek) {
      const allowedDays = menu.daysOfWeek.split(',').map((d) => d.trim());
      if (!allowedDays.includes(currentDay)) return false;
    }
    if (menu.startTime && currentTime < menu.startTime) return false;
    if (menu.endTime && currentTime > menu.endTime) return false;
    return true;
  }

  private computeStockStatus(effectiveStock: number | null): StockStatus {
    if (effectiveStock === null) return STOCK_STATUS.AVAILABLE;
    if (effectiveStock <= 0) return STOCK_STATUS.OUT_OF_STOCK;
    if (effectiveStock <= 3) return STOCK_STATUS.LOW_STOCK;
    return STOCK_STATUS.AVAILABLE;
  }

  private buildSections(
    items: any[],
  ): Record<string, MenuItemEntry[]> {
    const sections: Record<string, MenuItemEntry[]> = {};

    for (const item of items) {
      const sectionName = item.sectionName || 'General';
      if (!sections[sectionName]) sections[sectionName] = [];

      const effectiveStock = item.product.stock;
      const price = Number(item.product.price);

      sections[sectionName].push({
        id: item.product.id,
        menuItemId: item.id,
        name: item.product.name,
        description: item.product.description,
        price,
        imageUrl: item.product.imageUrl,
        stockStatus: this.computeStockStatus(effectiveStock),
      });
    }

    return sections;
  }
}
