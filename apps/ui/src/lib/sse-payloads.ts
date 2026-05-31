/**
 * Shape exacto de los eventos SSE emitidos por el backend.
 *
 * Duplicado deliberado de
 *   apps/api-core/src/events/payloads/order-event-payloads.ts
 * El monorepo no tiene paquete shared; el drift entre ambas se mitiga
 * con el contract test del backend (`order-event-payloads.spec.ts`).
 *
 * Si modificás el shape en un lado, actualizá el otro y la lista canónica
 * del test. Audit H-AUX-02.
 */

export type OrderStatusName =
  | 'CREATED' | 'CONFIRMED' | 'PROCESSING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';

export type PaymentMethodName = 'CASH' | 'CARD' | 'DIGITAL_WALLET';

export interface OrderItemEventPayload {
  id: string;
  quantity: number;
  notes: string | null;
  productName: string;
}

export interface OrderCreatedPayload {
  id: string;
  orderNumber: number;
  status: OrderStatusName;
  isPaid: boolean;
  totalAmount: number;
  paymentMethod: PaymentMethodName | null;
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

export interface OrderUpdatedPayload {
  id: string;
  status: OrderStatusName;
  isPaid: boolean;
  paymentMethod: PaymentMethodName | null;
  cancellationReason: string | null;
}
