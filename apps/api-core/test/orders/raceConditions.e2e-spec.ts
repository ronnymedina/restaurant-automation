// test/orders/raceConditions.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { OrderStatus } from '@prisma/client';

import { OrdersService } from '../../src/orders/orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  InvalidStatusTransitionException,
  CannotCancelPaidOrderException,
} from '../../src/orders/exceptions/orders.exceptions';
import {
  bootstrapApp,
  seedRestaurant,
  seedProduct,
  openCashShift,
  seedOrder,
} from './orders.helpers';

jest.setTimeout(30_000);

describe('Order race conditions (H-05, H-13)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ordersService: OrdersService;

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
    ordersService = boot.moduleFixture.get(OrdersService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('H-13: double kitchenAdvanceStatus from two screens — exactly one wins, the other throws', async () => {
    const { restaurant, category, admin } = await seedRestaurant(prisma, 'h13-double');
    const product = await seedProduct(prisma, restaurant.id, category.id);
    const shift = await openCashShift(prisma, restaurant.id, admin.id);
    const order = await seedOrder(prisma, restaurant.id, shift.id, product.id, {
      status: 'PROCESSING',
    });

    const [resA, resB] = await Promise.allSettled([
      ordersService.kitchenAdvanceStatus(order.id, restaurant.id, OrderStatus.SERVED),
      ordersService.kitchenAdvanceStatus(order.id, restaurant.id, OrderStatus.SERVED),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InvalidStatusTransitionException,
    );
  });

  it('H-13: cancel vs advance — final state is deterministic (CANCELLED or SERVED, never corrupted)', async () => {
    const { restaurant, category, admin } = await seedRestaurant(prisma, 'h13-cancel');
    const product = await seedProduct(prisma, restaurant.id, category.id);
    const shift = await openCashShift(prisma, restaurant.id, admin.id);
    const order = await seedOrder(prisma, restaurant.id, shift.id, product.id, {
      status: 'PROCESSING',
    });

    await Promise.allSettled([
      ordersService.cancelOrder(order.id, restaurant.id, 'cliente se fue'),
      ordersService.kitchenAdvanceStatus(order.id, restaurant.id, OrderStatus.SERVED),
    ]);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    // Final state must be one of the two valid terminal states for this race —
    // never PROCESSING (stale) and never some impossible drift state.
    expect([OrderStatus.CANCELLED, OrderStatus.SERVED]).toContain(final.status);
  });

  it('R2-01: concurrent markAsPaid ‖ cancelOrder never yields {CANCELLED, isPaid:true}', async () => {
    // Invariant: it is IMPOSSIBLE for an order to be both CANCELLED and isPaid=true.
    // Under the pay‖cancel race, exactly one operation wins via the conditional
    // UPDATE guards (transitionStatusIfMatchesAndUnpaid for pay, cancelOrderIfCancellable
    // for cancel — both guarded by isPaid=false). The loser gets a domain error.
    const { restaurant, category, admin } = await seedRestaurant(prisma, 'r2-01');
    const product = await seedProduct(prisma, restaurant.id, category.id);
    const shift = await openCashShift(prisma, restaurant.id, admin.id);
    // SERVED+unpaid: valid target for both markAsPaid and cancelOrder.
    const order = await seedOrder(prisma, restaurant.id, shift.id, product.id, {
      status: 'SERVED',
    });

    const [payResult, cancelResult] = await Promise.allSettled([
      ordersService.markAsPaid(order.id, restaurant.id, 'CASH'),
      ordersService.cancelOrder(order.id, restaurant.id, 'race test'),
    ]);

    // Primary safety invariant: the impossible state must NEVER exist.
    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const isCorrupted = final.status === OrderStatus.CANCELLED && final.isPaid === true;
    expect(isCorrupted).toBe(false);

    // Exactly one operation must have succeeded and one must have failed.
    const fulfilled = [payResult, cancelResult].filter((r) => r.status === 'fulfilled');
    const rejected = [payResult, cancelResult].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser must have thrown a domain exception, not an unexpected error.
    const loserReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(
      loserReason instanceof InvalidStatusTransitionException ||
      loserReason instanceof CannotCancelPaidOrderException,
    ).toBe(true);

    // The final state must be one of exactly two valid outcomes:
    //   (a) pay won  → isPaid=true, status=SERVED (status unchanged by markAsPaid on SERVED)
    //   (b) cancel won → status=CANCELLED, isPaid=false
    const payWon = payResult.status === 'fulfilled';
    if (payWon) {
      expect(final.isPaid).toBe(true);
      expect(final.status).not.toBe(OrderStatus.CANCELLED);
    } else {
      expect(final.status).toBe(OrderStatus.CANCELLED);
      expect(final.isPaid).toBe(false);
    }
  });

  it('H-05: double markAsPaid — no double-pay, no corrupted state', async () => {
    // Contract (H-05): under concurrent markAsPaid, the conditional UPDATE
    // guarded by (status, isPaid=false) ensures exactly one transition wins.
    // The runner-up may either short-circuit via the idempotent isPaid check
    // (if it observes the committed write) or surface
    // InvalidStatusTransitionException (if the optimistic UPDATE collided).
    // Either way the order ends paid with no duplicate metadata. markAsPaid ya
    // no auto-avanza el status (cobro en dos pasos, R2-02): queda SERVED + isPaid.
    const { restaurant, category, admin } = await seedRestaurant(prisma, 'h05-double');
    const product = await seedProduct(prisma, restaurant.id, category.id);
    const shift = await openCashShift(prisma, restaurant.id, admin.id);
    const order = await seedOrder(prisma, restaurant.id, shift.id, product.id, {
      status: 'SERVED',
    });

    const [r1, r2] = await Promise.allSettled([
      ordersService.markAsPaid(order.id, restaurant.id, 'CASH'),
      ordersService.markAsPaid(order.id, restaurant.id, 'CASH'),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');

    // At least one must succeed.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // Any rejection must be the optimistic-lock collision, never a different error.
    for (const rej of rejected) {
      expect((rej as PromiseRejectedResult).reason).toBeInstanceOf(
        InvalidStatusTransitionException,
      );
    }

    // Persisted state: paid exactly once; el status no cambia por markAsPaid (R2-02).
    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.isPaid).toBe(true);
    expect(final.status).toBe(OrderStatus.SERVED);
    expect(final.paymentMethod).toBe('CASH');
  });
});
