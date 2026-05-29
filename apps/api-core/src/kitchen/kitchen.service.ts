import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, Restaurant } from '@prisma/client';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { SseService } from '../events/sse.service';
import { TimezoneService } from '../restaurants/timezone.service';
import { KitchenOrderSerializer } from './serializers/kitchen-order.serializer';
import { KitchenTokenService } from './kitchen-token.service';

@Injectable()
export class KitchenService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly ordersService: OrdersService,
    private readonly orderRepository: OrderRepository,
    private readonly sseService: SseService,
    private readonly timezoneService: TimezoneService,
    private readonly tokenService: KitchenTokenService,
  ) {}

  async getActiveOrders(restaurant: Restaurant) {
    const orders = await this.orderRepository.findActiveOrders(
      restaurant.id,
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
    );
    const tz = await this.timezoneService.getTimezone(restaurant.id);
    return orders.map((o) => new KitchenOrderSerializer(o, tz));
  }

  async advanceStatus(restaurant: Restaurant, orderId: string, status: OrderStatus) {
    const order = await this.ordersService.kitchenAdvanceStatus(orderId, restaurant.id, status);
    const tz = await this.timezoneService.getTimezone(restaurant.id);
    return new KitchenOrderSerializer(order, tz);
  }

  async getTokenInfo(restaurantId: string): Promise<{ hasToken: boolean; expiresAt: Date | null }> {
    const restaurant = await this.restaurantsService.findByIdWithSettings(restaurantId);
    const settings = restaurant?.settings;
    if (!settings?.kitchenTokenHash || !settings.kitchenTokenExpiresAt) {
      return { hasToken: false, expiresAt: null };
    }
    if (new Date() > settings.kitchenTokenExpiresAt) {
      return { hasToken: false, expiresAt: null };
    }
    return {
      hasToken: true,
      expiresAt: settings.kitchenTokenExpiresAt,
    };
  }

  async generateToken(
    restaurantId: string,
    expiresAt: string,
  ): Promise<{ token: string; expiresAt: Date; kitchenUrl: string }> {
    const restaurant = await this.restaurantsService.findById(restaurantId);
    if (!restaurant) throw new UnauthorizedException();

    const expiresAtDate = new Date(expiresAt);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (expiresAtDate < tomorrow) {
      throw new BadRequestException('La fecha de vencimiento debe ser al menos mañana');
    }

    const { plainToken, tokenHash } = this.tokenService.generate();

    await this.restaurantsService.upsertSettings(restaurantId, {
      kitchenTokenHash: tokenHash,
      kitchenTokenExpiresAt: expiresAtDate,
    });

    return {
      token: plainToken,
      expiresAt: expiresAtDate,
      kitchenUrl: `/kitchen?slug=${restaurant.slug}&token=${plainToken}`,
    };
  }
}
