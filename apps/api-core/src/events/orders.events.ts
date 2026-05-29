import { Injectable } from '@nestjs/common';
import { SseService } from './sse.service';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

/**
 * Order-shaped payload accepted by emit*. We only require `id` for logging
 * purposes; the SSE payload is currently empty (clients fetch the order via
 * the REST API after receiving the event). Accepting `{ id: string }` keeps
 * the door open for both the raw Prisma `Order` and the serialized
 * `OrderSerializer` (which exposes `totalAmount` as `number`, not `bigint`).
 */
type OrderLike = { id: string };

@Injectable()
export class OrderEventsService {
  constructor(private readonly sseService: SseService) {}

  emitOrderCreated(restaurantId: string, _order: OrderLike): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, {});
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, {});
  }

  emitOrderUpdated(restaurantId: string, _order: OrderLike): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, {});
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, {});
  }
}
