import { instanceToPlain } from 'class-transformer';
import { CashShiftStatus } from '@prisma/client';

import { CashShiftSerializer } from './cash-shift.serializer';

describe('CashShiftSerializer (H-25)', () => {
  it('si alguien expone openingBalance/totalSales por error, JSON.stringify no falla con BigInt', () => {
    const partial = {
      id: 'shift-1',
      restaurantId: 'r1',
      userId: 'u1',
      status: CashShiftStatus.CLOSED,
      lastOrderNumber: 0,
      openingBalance: 1000n,
      totalSales: 5000n,
      totalOrders: 2,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: new Date('2026-05-29T18:00:00Z'),
      closedBy: 'u1',
    };
    const instance = new CashShiftSerializer(partial as any, 'UTC');
    expect(() => JSON.stringify(instanceToPlain(instance))).not.toThrow();
  });

  it('@Transform(fromCents) defensivo sobre BigInt campos (compile-time fence)', () => {
    const instance = new CashShiftSerializer(
      {
        id: 'shift-1',
        openingBalance: 1000n,
        totalSales: 5000n,
        openedAt: new Date('2026-05-29T10:00:00Z'),
        closedAt: null,
        restaurantId: 'r',
        userId: 'u',
        lastOrderNumber: 0,
        totalOrders: 0,
        status: CashShiftStatus.OPEN,
        closedBy: null,
      } as any,
      'UTC',
    );
    const plain = instanceToPlain(instance);
    expect(plain.openingBalance).toBeUndefined();
    expect(plain.totalSales).toBeUndefined();
  });
});
