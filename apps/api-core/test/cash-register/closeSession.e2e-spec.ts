// test/cash-register/closeSession.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

describe('POST /v1/cash-register/close - closeSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;
  let basicToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;
    basicToken = await login(app, restA.basic.email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).post('/v1/cash-register/close').expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sin sesión abierta → 409 NO_OPEN_REGISTER', async () => {
    // Use a fresh restaurant with no open session
    const restFresh = await seedRestaurant(prisma, 'NoSession');
    const freshToken = await login(app, restFresh.admin.email);

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(409);

    expect(res.body.code).toBe('NO_OPEN_REGISTER');
  });

  it('Con pedidos pendientes (CREATED/PROCESSING) → 409 PENDING_ORDERS_ON_SHIFT', async () => {
    const restP = await seedRestaurant(prisma, 'Pending');
    const tokenP = await login(app, restP.admin.email);
    const product = await seedProduct(prisma, restP.restaurant.id, restP.category.id);
    const shiftId = await openCashShiftViaApi(app, tokenP);
    await seedOrderOnShift(prisma, restP.restaurant.id, shiftId, product.id, 'CREATED');

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${tokenP}`)
      .expect(409);

    expect(res.body.code).toBe('PENDING_ORDERS_ON_SHIFT');
    expect(res.body.details.pendingCount).toBe(1);
  });

  it('Con pedidos PROCESSING → 409 PENDING_ORDERS_ON_SHIFT', async () => {
    const restQ = await seedRestaurant(prisma, 'Processing');
    const tokenQ = await login(app, restQ.admin.email);
    const product = await seedProduct(prisma, restQ.restaurant.id, restQ.category.id);
    const shiftId = await openCashShiftViaApi(app, tokenQ);
    await seedOrderOnShift(prisma, restQ.restaurant.id, shiftId, product.id, 'PROCESSING');

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${tokenQ}`)
      .expect(409);

    expect(res.body.code).toBe('PENDING_ORDERS_ON_SHIFT');
    expect(res.body.details.pendingCount).toBe(1);
  });

  it('Cierra sesión con pedidos completados → 200 con session y summary', async () => {
    const restC = await seedRestaurant(prisma, 'C');
    const tokenC = await login(app, restC.admin.email);
    const product = await seedProduct(prisma, restC.restaurant.id, restC.category.id);
    const shiftId = await openCashShiftViaApi(app, tokenC);
    await seedOrderOnShift(prisma, restC.restaurant.id, shiftId, product.id, 'COMPLETED');

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    // session shape — new serializer
    expect(res.body.session).toBeDefined();
    expect(res.body.session.status).toBe('CLOSED');
    expect(typeof res.body.session.displayOpenedAt).toBe('string');
    expect(res.body.session.openedAt).toBeUndefined();
    expect(res.body.session.closedAt).toBeUndefined();
    expect(res.body.session.restaurantId).toBeUndefined();
    expect(res.body.session.userId).toBeUndefined();
    expect(res.body.session.lastOrderNumber).toBeUndefined();
    expect(res.body.session.openingBalance).toBeUndefined();
    expect(res.body.session.totalSales).toBeUndefined();
    expect(res.body.session.totalOrders).toBeUndefined();

    // summary shape
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.totalOrders).toBe('number');
    expect(typeof res.body.summary.totalSales).toBe('number');
    expect(res.body.summary.totalOrders).toBe(1);

    // paymentBreakdown is an array
    expect(Array.isArray(res.body.summary.paymentBreakdown)).toBe(true);
    if (res.body.summary.paymentBreakdown.length > 0) {
      const item = res.body.summary.paymentBreakdown[0];
      expect(typeof item.method).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(typeof item.total).toBe('number');
    }
  });

  it('summary.totalSales refleja solo órdenes COMPLETED (excluye CANCELLED)', async () => {
    const restMixed = await seedRestaurant(prisma, 'Mixed');
    const tokenMixed = await login(app, restMixed.admin.email);
    const product = await seedProduct(prisma, restMixed.restaurant.id, restMixed.category.id);
    const shiftMixed = await openCashShiftViaApi(app, tokenMixed);
    // 1 COMPLETED order (1000 centavos = 10 pesos) + 1 CANCELLED (should be excluded)
    await seedOrderOnShift(prisma, restMixed.restaurant.id, shiftMixed, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restMixed.restaurant.id, shiftMixed, product.id, 'CANCELLED');

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${tokenMixed}`)
      .expect(200);

    // Only the COMPLETED order counts (1000 centavos = 10 pesos via fromCents)
    expect(res.body.summary.totalSales).toBeCloseTo(10, 2);
    expect(res.body.summary.totalOrders).toBe(1);
  });
});
