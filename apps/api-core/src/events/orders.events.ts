import { Injectable } from '@nestjs/common';
import { SseService } from './sse.service';
import {
  OrderCreatedPayload,
  OrderUpdatedPayload,
  KitchenOrderPayload,
} from './payloads/order-event-payloads';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

/**
 * Emisor tipado de eventos SSE de Order.
 *
 * Cada método publica el mismo evento en dos canales con shapes distintos:
 *   - restaurant stream (dashboard): payload completo en NEW, delta en UPDATED.
 *   - kitchen stream (cocina): payload completo en ambos.
 *
 * Las shapes están definidas en `./payloads/order-event-payloads.ts` y
 * el builder de `OrdersService` es responsable de armarlas. Audit H-AUX-02.
 */
@Injectable()
export class OrderEventsService {
  constructor(private readonly sseService: SseService) {}

  emitOrderCreated(
    restaurantId: string,
    dashboard: OrderCreatedPayload,
    kitchen: KitchenOrderPayload,
  ): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, dashboard);
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, kitchen);
  }

  emitOrderUpdated(
    restaurantId: string,
    dashboard: OrderUpdatedPayload,
    kitchen: KitchenOrderPayload,
  ): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, dashboard);
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, kitchen);
  }
}
