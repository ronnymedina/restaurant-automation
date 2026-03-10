import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { EventsGateway } from './events.gateway';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

@Injectable()
export class OrderEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitOrderCreated(restaurantId: string, order: Order): void {
    this.gateway.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, { order });
    this.gateway.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, { order });
  }

  emitOrderUpdated(restaurantId: string, order: Order): void {
    this.gateway.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, { order });
    this.gateway.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, { order });
  }
}
