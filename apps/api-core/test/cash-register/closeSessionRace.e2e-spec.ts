// test/cash-register/closeSessionRace.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { CashRegisterService } from '../../src/cash-register/cash-register.service';
import { OrdersService } from '../../src/orders/orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PendingOrdersException } from '../../src/cash-register/exceptions/cash-register.exceptions';
import { RegisterNotOpenException } from '../../src/orders/exceptions/orders.exceptions';
import {
  bootstrapApp,
  seedRestaurant,
  seedProduct,
  openCashShiftViaApi,
  login,
} from './cash-register.helpers';

jest.setTimeout(30_000);

describe('closeSession vs createOrder race (H-09)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cashRegisterService: CashRegisterService;
  let ordersService: OrdersService;

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
    cashRegisterService = boot.moduleFixture.get(CashRegisterService);
    ordersService = boot.moduleFixture.get(OrdersService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('createOrder vs closeSession contention: no orphan order in CLOSED shift', async () => {
    const { restaurant, category, admin } = await seedRestaurant(prisma, 'h09');
    const product = await seedProduct(prisma, restaurant.id, category.id);
    const token = await login(app, admin.email);
    const shiftId = await openCashShiftViaApi(app, token);

    const createPromise = ordersService.createOrder(restaurant.id, shiftId, {
      items: [{ productId: product.id, quantity: 1, notes: 'race A' }],
      orderType: 'PICKUP',
    } as any);

    // Brief stagger so create is in flight; the lock contention is real either way.
    await new Promise((r) => setTimeout(r, 20));

    const closePromise = cashRegisterService.closeSession(restaurant.id, admin.id);

    const [createRes, closeRes] = await Promise.allSettled([createPromise, closePromise]);

    if (createRes.status === 'fulfilled') {
      // create won → close must observe the pending order
      expect(closeRes.status).toBe('rejected');
      expect((closeRes as PromiseRejectedResult).reason).toBeInstanceOf(PendingOrdersException);
    } else {
      // close won → create must fail with RegisterNotOpen
      expect(createRes.status).toBe('rejected');
      expect((createRes as PromiseRejectedResult).reason).toBeInstanceOf(RegisterNotOpenException);
    }
  });
});
