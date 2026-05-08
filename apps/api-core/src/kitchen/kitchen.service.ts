import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, Restaurant } from '@prisma/client';

import { randomBytes } from 'crypto';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { SseService } from '../events/sse.service';
import { TimezoneService } from '../restaurants/timezone.service';
import { KitchenOrderSerializer } from './serializers/kitchen-order.serializer';

@Injectable()
export class KitchenService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly ordersService: OrdersService,
    private readonly orderRepository: OrderRepository,
    private readonly sseService: SseService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async getActiveOrders(restaurant: Restaurant) {
    const orders = await this.orderRepository.findByRestaurantId(
      restaurant.id,
      undefined,
      [OrderStatus.CREATED, OrderStatus.PROCESSING],
    );
    const tz = await this.timezoneService.getTimezone(restaurant.id);
    return orders.map((o) => new KitchenOrderSerializer(o, tz));
  }

  async advanceStatus(restaurant: Restaurant, orderId: string, status: OrderStatus) {
    const order = await this.ordersService.kitchenAdvanceStatus(orderId, restaurant.id, status);
    const tz = await this.timezoneService.getTimezone(restaurant.id);
    return new KitchenOrderSerializer(order, tz);
  }

  async cancelOrder(restaurant: Restaurant, orderId: string, reason: string) {
    const order = await this.ordersService.cancelOrder(orderId, restaurant.id, reason);
    const tz = await this.timezoneService.getTimezone(restaurant.id);
    return new KitchenOrderSerializer(order, tz);
  }

  async getTokenInfo(restaurantId: string): Promise<{ kitchenUrl: string | null; expiresAt: Date | null }> {
    const restaurant = await this.restaurantsService.findByIdWithSettings(restaurantId);
    const settings = restaurant?.settings;
    if (!settings?.kitchenToken || !settings.kitchenTokenExpiresAt) {
      return { kitchenUrl: null, expiresAt: null };
    }
    if (new Date() > settings.kitchenTokenExpiresAt) {
      return { kitchenUrl: null, expiresAt: null };
    }
    return {
      kitchenUrl: `/kitchen?slug=${restaurant!.slug}&token=${settings.kitchenToken}`,
      expiresAt: settings.kitchenTokenExpiresAt,
    };
  }

  async generateToken(
    restaurantId: string,
    expiresAt: string,
  ): Promise<{ token: string; expiresAt: Date; kitchenUrl: string }> {
    const restaurant = await this.restaurantsService.findById(restaurantId);
    if (!restaurant) throw new UnauthorizedException();

    const token = randomBytes(32).toString('hex');

    const expiresAtDate = new Date(expiresAt);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (expiresAtDate < tomorrow) {
      throw new BadRequestException('La fecha de vencimiento debe ser al menos mañana');
    }

    await this.restaurantsService.upsertSettings(restaurantId, {
      kitchenToken: token,
      kitchenTokenExpiresAt: expiresAtDate,
    });

    return {
      token,
      expiresAt: expiresAtDate,
      kitchenUrl: `/kitchen?slug=${restaurant.slug}&token=${token}`,
    };
  }

  async notifyOffline(restaurant: Restaurant) {
    this.sseService.emitToRestaurant(restaurant.id, 'kitchen:offline', {});
  }
}
