// test/cash-register/sessionSummary.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

describe('GET /v1/cash-register/summary/:sessionId - sessionSummary (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sesión inexistente → 404 REGISTER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/summary/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('REGISTER_NOT_FOUND');
  });

  it('Retorna session y summary', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe(shiftId);
    expect(res.body.summary).toBeDefined();
    expect(res.body.orders).toBeUndefined();
  });

  it('session expone displayOpenedAt como string, no expone restaurantId ni userId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { session } = res.body;
    expect(typeof session.displayOpenedAt).toBe('string');
    expect(session.openedAt).toBeUndefined();
    expect(session.restaurantId).toBeUndefined();
    expect(session.userId).toBeUndefined();
    expect(session.lastOrderNumber).toBeUndefined();
    expect(session.openingBalance).toBeUndefined();
    expect(session.totalSales).toBeUndefined();
    expect(session.totalOrders).toBeUndefined();
  });

  it('summary.completed refleja las órdenes COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { completed } = res.body.summary;
    expect(completed).toBeDefined();
    expect(completed.count).toBe(2);
    // 2 orders × 1000 centavos = 2000 centavos = 20 pesos
    expect(completed.total).toBeCloseTo(20, 2);
  });

  it('summary.cancelled refleja las órdenes CANCELLED (sin total)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { cancelled } = res.body.summary;
    expect(cancelled).toBeDefined();
    expect(cancelled.count).toBe(1);
    expect(cancelled.total).toBeUndefined();
  });

  it('summary.paymentBreakdown es un array con {method, count, total}', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { paymentBreakdown } = res.body.summary;
    expect(Array.isArray(paymentBreakdown)).toBe(true);
    for (const item of paymentBreakdown) {
      expect(typeof item.method).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(typeof item.total).toBe('number');
    }
  });

  it('summary NO contiene ordersByStatus, totalSales ni totalOrders', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.ordersByStatus).toBeUndefined();
    expect(res.body.summary.totalSales).toBeUndefined();
    expect(res.body.summary.totalOrders).toBeUndefined();
  });
});
