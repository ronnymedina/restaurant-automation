import {
  ORDER_CREATED_PAYLOAD_KEYS,
  ORDER_UPDATED_PAYLOAD_KEYS,
  ORDER_ITEM_EVENT_PAYLOAD_KEYS,
  KITCHEN_ORDER_PAYLOAD_KEYS,
  KITCHEN_ORDER_ITEM_PAYLOAD_KEYS,
  OrderCreatedPayload,
  OrderUpdatedPayload,
  KitchenOrderPayload,
} from './order-event-payloads';
import { OrderStatus } from '@prisma/client';

/**
 * Contrato: las listas canónicas de keys deben coincidir exactamente con
 * los keys de un objeto que satisface la interface correspondiente.
 *
 * Si alguien agrega/quita un campo en una interface sin actualizar la
 * lista (o viceversa), este test rompe — protege contra drift.
 */
describe('order event payload contracts', () => {
  it('OrderCreatedPayload keys match the canonical list', () => {
    const sample: OrderCreatedPayload = {
      id: '', orderNumber: 0, status: OrderStatus.CREATED, isPaid: false, totalAmount: 0,
      paymentMethod: null, cancellationReason: null,
      customerEmail: null, customerPhone: null, deliveryAddress: null, deliveryReferences: null,
      orderSource: '', orderType: '', displayTime: '', items: [],
    };
    expect(Object.keys(sample).sort()).toEqual([...ORDER_CREATED_PAYLOAD_KEYS].sort());
  });

  it('OrderUpdatedPayload keys match the canonical list', () => {
    const sample: OrderUpdatedPayload = {
      id: '', status: OrderStatus.CREATED, isPaid: false,
      paymentMethod: null, cancellationReason: null,
    };
    expect(Object.keys(sample).sort()).toEqual([...ORDER_UPDATED_PAYLOAD_KEYS].sort());
  });

  it('OrderItemEventPayload keys match the canonical list', () => {
    const sample = { id: '', quantity: 0, notes: null, productName: '' };
    expect(Object.keys(sample).sort()).toEqual([...ORDER_ITEM_EVENT_PAYLOAD_KEYS].sort());
  });

  it('KitchenOrderPayload keys match the canonical list', () => {
    const sample: KitchenOrderPayload = {
      id: '', orderNumber: 0, status: OrderStatus.CREATED, displayTime: '', items: [],
    };
    expect(Object.keys(sample).sort()).toEqual([...KITCHEN_ORDER_PAYLOAD_KEYS].sort());
  });

  it('KitchenOrderItemPayload keys match the canonical list', () => {
    const sample = { quantity: 0, notes: null, productName: '' };
    expect(Object.keys(sample).sort()).toEqual([...KITCHEN_ORDER_ITEM_PAYLOAD_KEYS].sort());
  });

  it('OrderUpdatedPayload keys are a strict subset of OrderCreatedPayload', () => {
    const dashboardKeys = new Set<string>(ORDER_CREATED_PAYLOAD_KEYS);
    for (const k of ORDER_UPDATED_PAYLOAD_KEYS) {
      expect(dashboardKeys.has(k)).toBe(true);
    }
  });
});
