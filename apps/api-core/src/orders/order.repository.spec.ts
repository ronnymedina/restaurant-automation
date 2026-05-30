import { Test } from '@nestjs/testing';
import { OrderStatus, PaymentMethod, CashShiftStatus } from '@prisma/client';

import { CreateOrderData, OrderRepository } from './order.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('CreateOrderData (H-21)', () => {
  it('paymentMethod debe ser PaymentMethod | undefined, no string libre', () => {
    const valid: CreateOrderData['paymentMethod'] = PaymentMethod.CASH;
    const empty: CreateOrderData['paymentMethod'] = undefined;
    expect(valid).toBe(PaymentMethod.CASH);
    expect(empty).toBeUndefined();
    // @ts-expect-error — string arbitrario no debe ser asignable
    const invalid: CreateOrderData['paymentMethod'] = 'INVALID_METHOD';
    expect(invalid).toBe('INVALID_METHOD');
  });
});

const mockPrisma = {
  order: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('OrderRepository.findActiveOrders (H-32, H-33)', () => {
  let repo: OrderRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    repo = moduleRef.get(OrderRepository);
  });

  it('H-32: where incluye cashShift.status = OPEN', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);
    await repo.findActiveOrders('r1', [OrderStatus.CREATED, OrderStatus.CONFIRMED]);

    expect(mockPrisma.order.findMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.order.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      restaurantId: 'r1',
      status: { in: [OrderStatus.CREATED, OrderStatus.CONFIRMED] },
      cashShift: { status: CashShiftStatus.OPEN },
    });
  });

  it('H-33: orderBy es FIFO (createdAt asc, tiebreaker orderNumber asc)', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);
    await repo.findActiveOrders('r1', [OrderStatus.CREATED]);

    const call = mockPrisma.order.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([
      { createdAt: 'asc' },
      { orderNumber: 'asc' },
    ]);
  });
});
