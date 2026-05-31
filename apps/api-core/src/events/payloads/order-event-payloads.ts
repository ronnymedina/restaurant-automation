import { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * Payloads de los eventos SSE de Order.
 *
 * Audit H-AUX-02: los eventos antes viajaban con `data: {}` y los clientes
 * refetcheaban la lista entera. Ahora cada evento lleva un payload tipado
 * y mínimo. La asimetría dashboard/cocina es deliberada:
 *
 *   - Dashboard: order:new = OrderCreatedPayload (14 campos visibles en la UI).
 *                order:updated = OrderUpdatedPayload (5 campos mutables — delta).
 *     Cliente hace merge `{...existing, ...delta}`. Posible porque el dashboard
 *     siempre tiene la orden cargada (loadOrders inicial o order:new previo).
 *
 *   - Cocina: ambos eventos = KitchenOrderPayload (5 campos + items[]).
 *     Sin delta porque la cocina necesita el payload completo cuando una
 *     orden transita CREATED → CONFIRMED (nunca la había visto).
 *
 * Las listas `*_PAYLOAD_KEYS` son la fuente de verdad para el test de
 * contrato: el builder de cada payload debe retornar exactamente esas
 * keys, ni una más ni una menos. Si agregás un campo a la interface
 * agregalo también a la lista — el test rompe si los keys del runtime
 * no coinciden con la lista.
 */

// ── Dashboard ─────────────────────────────────────────────────────────

export interface OrderItemEventPayload {
  id: string;
  quantity: number;
  notes: string | null;
  productName: string;
}

export const ORDER_ITEM_EVENT_PAYLOAD_KEYS = [
  'id', 'quantity', 'notes', 'productName',
] as const;

export interface OrderCreatedPayload {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  isPaid: boolean;
  totalAmount: number;
  paymentMethod: PaymentMethod | null;
  cancellationReason: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryReferences: string | null;
  orderSource: string;
  orderType: string;
  displayTime: string;
  items: OrderItemEventPayload[];
}

export const ORDER_CREATED_PAYLOAD_KEYS = [
  'id', 'orderNumber', 'status', 'isPaid', 'totalAmount',
  'paymentMethod', 'cancellationReason',
  'customerEmail', 'customerPhone', 'deliveryAddress', 'deliveryReferences',
  'orderSource', 'orderType', 'displayTime', 'items',
] as const;

export interface OrderUpdatedPayload {
  id: string;
  status: OrderStatus;
  isPaid: boolean;
  paymentMethod: PaymentMethod | null;
  cancellationReason: string | null;
}

export const ORDER_UPDATED_PAYLOAD_KEYS = [
  'id', 'status', 'isPaid', 'paymentMethod', 'cancellationReason',
] as const;

// ── Cocina ────────────────────────────────────────────────────────────

export interface KitchenOrderItemPayload {
  quantity: number;
  notes: string | null;
  productName: string;
}

export const KITCHEN_ORDER_ITEM_PAYLOAD_KEYS = [
  'quantity', 'notes', 'productName',
] as const;

export interface KitchenOrderPayload {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  displayTime: string;
  items: KitchenOrderItemPayload[];
}

export const KITCHEN_ORDER_PAYLOAD_KEYS = [
  'id', 'orderNumber', 'status', 'displayTime', 'items',
] as const;
