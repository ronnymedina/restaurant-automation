import { KitchenOrderSerializer } from './kitchen-order.serializer';
import { OrderStatus } from '@prisma/client';
import { instanceToPlain } from 'class-transformer';

describe('KitchenOrderSerializer', () => {
  it('formats displayTime in UTC when no timezone provided', () => {
    const order = {
      id: 'o1', orderNumber: 1, status: 'CREATED', totalAmount: 1000,
      createdAt: new Date('2025-01-01T17:30:00Z'), items: [],
    };
    const serializer = new KitchenOrderSerializer(order);
    expect(serializer.displayTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formats displayTime in America/Santiago timezone', () => {
    const order = {
      id: 'o1', orderNumber: 1, status: 'CREATED', totalAmount: 1000,
      createdAt: new Date('2025-01-01T17:30:00Z'), items: [],
    };
    // America/Santiago is UTC-3 in January (summer/daylight saving)
    const serializer = new KitchenOrderSerializer(order, 'America/Santiago');
    expect(serializer.displayTime).toBe('14:30');
  });

  it('maps items to KitchenOrderItemSerializer', () => {
    const order = {
      id: 'o1', orderNumber: 1, status: 'CREATED', totalAmount: 1000,
      createdAt: new Date('2025-01-01T17:30:00Z'),
      items: [{ id: 'i1', quantity: 2, unitPrice: 500, subtotal: 1000, notes: null, product: { id: 'p1', name: 'Burger', imageUrl: null } }],
    };
    const serializer = new KitchenOrderSerializer(order, 'UTC');
    expect(serializer.items).toHaveLength(1);
    expect(serializer.items[0].quantity).toBe(2);
  });
});

describe('KitchenOrderSerializer (H-34)', () => {
  it('NO copia restaurantId/cashShiftId/isPaid si vienen en el payload', () => {
    const partial = {
      id: 'o1',
      orderNumber: 42,
      status: OrderStatus.PROCESSING,
      totalAmount: 5000n,
      orderType: 'DINE_IN',
      tableNumber: '7',
      createdAt: new Date('2026-05-29T12:00:00Z'),
      restaurantId: 'should-not-be-here',
      cashShiftId: 'should-not-be-here',
      isPaid: true,
      customerEmail: 'leak@example.com',
      items: [],
    };
    const instance = new KitchenOrderSerializer(partial as any, 'UTC');
    expect((instance as any).restaurantId).toBeUndefined();
    expect((instance as any).cashShiftId).toBeUndefined();
    expect((instance as any).isPaid).toBeUndefined();
    expect((instance as any).customerEmail).toBeUndefined();
    const plain = instanceToPlain(instance) as Record<string, unknown>;
    expect(plain.restaurantId).toBeUndefined();
    expect(plain.cashShiftId).toBeUndefined();
    expect(plain.isPaid).toBeUndefined();
    expect(plain.customerEmail).toBeUndefined();
    expect(plain.id).toBe('o1');
    expect(plain.orderNumber).toBe(42);
    expect(plain.totalAmount).toBe(50); // 5000 centavos → 50 pesos
  });
});
