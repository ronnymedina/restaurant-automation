import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
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
    return this.orderRepository.findByRestaurantId(
      restaurant.id,
      undefined,
      [OrderStatus.CREATED, OrderStatus.PROCESSING],
    );
  }

  async advanceStatus(restaurant: Restaurant, orderId: string, status: OrderStatus) {
    return this.ordersService.kitchenAdvanceStatus(orderId, restaurant.id, status);
  }

  async cancelOrder(restaurant: Restaurant, orderId: string, reason: string) {
    return this.ordersService.cancelOrder(orderId, restaurant.id, reason);
  }

  async getTokenInfo(restaurantId: string): Promise<{ kitchenUrl: string | null; expiresAt: Date | null }> {
    const restaurant = await this.restaurantsService.findById(restaurantId);
    if (!restaurant?.kitchenToken || !restaurant.kitchenTokenExpiresAt) {
      return { kitchenUrl: null, expiresAt: null };
    }
    if (new Date() > restaurant.kitchenTokenExpiresAt) {
      return { kitchenUrl: null, expiresAt: null };
    }
    return {
      kitchenUrl: `/kitchen/${restaurant.slug}?token=${restaurant.kitchenToken}`,
      expiresAt: restaurant.kitchenTokenExpiresAt,
    };
  }

  async generateToken(
    restaurantId: string,
    customExpiresAt?: string,
  ): Promise<{ token: string; expiresAt: Date; kitchenUrl: string }> {
    const restaurant = await this.restaurantsService.findById(restaurantId);
    if (!restaurant) throw new UnauthorizedException();

    const token = randomBytes(32).toString('hex');

    let expiresAt: Date;
    if (customExpiresAt) {
      expiresAt = new Date(customExpiresAt);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      if (expiresAt < tomorrow) {
        throw new BadRequestException('La fecha de vencimiento debe ser al menos mañana');
      }
    } else {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + KITCHEN_TOKEN_EXPIRY_DAYS);
    }

    await this.restaurantsService.update(restaurantId, {
      kitchenToken: token,
      kitchenTokenExpiresAt: expiresAt,
    });

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
