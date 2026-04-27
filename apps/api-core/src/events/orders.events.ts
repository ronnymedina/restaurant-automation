import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { SseService } from './sse.service';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

@Injectable()
export class OrderEventsService {
  constructor(private readonly sseService: SseService) {}

  emitOrderCreated(restaurantId: string, order: Order): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, {});
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, {});
  }

  emitOrderUpdated(restaurantId: string, order: Order): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, {});
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, {});
  }
}
