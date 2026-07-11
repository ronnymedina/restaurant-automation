import { instanceToPlain } from 'class-transformer';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { OrderSerializer } from './order.serializer';

describe('OrderSerializer (H-22)', () => {
  const partial = {
    id: 'o1',
    orderNumber: 7,
    restaurantId: 'r1',
    cashShiftId: 'cs1',
    status: OrderStatus.COMPLETED,
    totalAmount: 5000n,
    paymentMethod: PaymentMethod.CASH,
    isPaid: true,
    customerEmail: 'c@e.com',
    customerName: 'C',
    customerPhone: null,
    deliveryAddress: null,
    deliveryReferences: null,
    cancellationReason: null,
    orderSource: 'KIOSK',
    orderType: 'PICKUP',
    tableNumber: null,
    createdAt: new Date('2026-05-29T12:00:00Z'),
    updatedAt: new Date('2026-05-29T12:00:00Z'),
    items: [
      {
        id: 'oi1',
        quantity: 2,
        unitPrice: 2500n,
        subtotal: 5000n,
        notes: null,
        product: { id: 'p1', name: 'Burger', price: 2500n },
        menuItem: null,
      },
    ],
  };

  it('expone totalAmount en pesos', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect(plain.totalAmount).toBe(50);
  });

  it('expone items[].unitPrice y subtotal en pesos', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect((plain.items as any[])[0].unitPrice).toBe(25);
    expect((plain.items as any[])[0].subtotal).toBe(50);
  });

  it('expone items[].product.price en pesos', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect((plain.items as any[])[0].product.price).toBe(25);
  });

  it('preserva campos no monetarios', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect(plain.id).toBe('o1');
    expect(plain.orderNumber).toBe(7);
    expect(plain.status).toBe(OrderStatus.COMPLETED);
    expect(plain.paymentMethod).toBe(PaymentMethod.CASH);
    expect(plain.customerEmail).toBe('c@e.com');
  });

  it('serializa el menuItem con su id (R2-08: sin priceOverride)', () => {
    const withMenuItem = {
      ...partial,
      items: [
        {
          ...partial.items[0],
          menuItem: { id: 'mi1' },
        },
      ],
    };
    const plain = instanceToPlain(new OrderSerializer(withMenuItem as any));
    expect((plain.items as any[])[0].menuItem.id).toBe('mi1');
    expect((plain.items as any[])[0].menuItem.priceOverride).toBeUndefined();
  });
});
