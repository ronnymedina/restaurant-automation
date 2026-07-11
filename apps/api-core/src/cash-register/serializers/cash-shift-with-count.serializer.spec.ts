import { instanceToPlain } from 'class-transformer';
import { CashShiftStatus } from '@prisma/client';
import { CashShiftWithCountSerializer } from './cash-shift-with-count.serializer';

describe('CashShiftWithCountSerializer', () => {
  it('expone _count.orders explícito', () => {
    const partial = {
      id: 's1',
      restaurantId: 'r',
      userId: 'u',
      lastOrderNumber: 5,
      openingBalance: 0n,
      totalSales: 0n,
      totalOrders: 0,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: null,
      status: CashShiftStatus.OPEN,
      closedBy: null,
      _count: { orders: 12 },
    };
    const instance = new CashShiftWithCountSerializer(partial as any, 'UTC');
    const plain = instanceToPlain(instance);
    expect(plain._count).toEqual({ orders: 12 });
    expect(plain.id).toBe('s1');
  });

  it('CashShiftSerializer base no expone _count', () => {
    const { CashShiftSerializer } = require('./cash-shift.serializer');
    const partial = {
      id: 's1',
      restaurantId: 'r',
      userId: 'u',
      lastOrderNumber: 0,
      openingBalance: 0n,
      totalSales: 0n,
      totalOrders: 0,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: null,
      status: CashShiftStatus.OPEN,
      closedBy: null,
      _count: { orders: 12 },
    };
    const instance = new CashShiftSerializer(partial as any, 'UTC');
    const plain = instanceToPlain(instance);
    expect(plain._count).toBeUndefined();
  });
});
