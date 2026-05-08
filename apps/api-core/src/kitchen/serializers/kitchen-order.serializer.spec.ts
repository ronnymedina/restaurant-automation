import { KitchenOrderSerializer } from './kitchen-order.serializer';

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
