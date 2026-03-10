import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, Restaurant } from '@prisma/client';
import { randomBytes } from 'crypto';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { EventsGateway } from '../events/events.gateway';
import { KITCHEN_TOKEN_EXPIRY_DAYS } from '../config';

@Injectable()
export class KitchenService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly ordersService: OrdersService,
    private readonly orderRepository: OrderRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async getActiveOrders(restaurant: Restaurant) {
    const orders = await this.orderRepository.findByRestaurantId(restaurant.id);
    return orders.filter(
      (o) => o.status === OrderStatus.CREATED || o.status === OrderStatus.PROCESSING,
    );
  }

  async advanceStatus(restaurant: Restaurant, orderId: string, status: OrderStatus) {
    return this.ordersService.kitchenAdvanceStatus(orderId, restaurant.id, status);
  }

  async cancelOrder(restaurant: Restaurant, orderId: string, reason: string) {
    return this.ordersService.cancelOrder(orderId, restaurant.id, reason);
  }

  async generateToken(restaurantId: string): Promise<{ token: string; expiresAt: Date; kitchenUrl: string }> {
    const restaurant = await this.restaurantsService.findById(restaurantId);
    if (!restaurant) throw new UnauthorizedException();

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + KITCHEN_TOKEN_EXPIRY_DAYS);

    await this.restaurantsService.update(restaurantId, {
      kitchenToken: token,
      kitchenTokenExpiresAt: expiresAt,
    } as any);

    return {
      token,
      expiresAt,
      kitchenUrl: `/kitchen/${restaurant.slug}?token=${token}`,
    };
  }

  async notifyOffline(restaurant: Restaurant) {
    this.eventsGateway.emitToRestaurant(restaurant.id, 'kitchen:offline', {
      slug: restaurant.slug,
      since: new Date().toISOString(),
    });
  }
}
