// test/cash-register/sessionSummary.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';
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
  let otherTenantShiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED', true);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED', true);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED', false);

    const restB = await seedRestaurant(prisma, 'B');
    const adminTokenB = await login(app, restB.admin.email);
    otherTenantShiftId = await openCashShiftViaApi(app, adminTokenB);
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
      .set('Cookie', basicToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(403);
  });

  it('Sesión inexistente → 404 CASH_REGISTER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/summary/non-existent-id')
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(404);

    expect(res.body.code).toBe('CASH_REGISTER_NOT_FOUND');
  });

  it('Retorna session y summary (no stats, no orders)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe(shiftId);
    expect(res.body.summary).toBeDefined();
    expect(res.body.stats).toBeUndefined();
    expect(res.body.orders).toBeUndefined();
  });

  it('session expone displayOpenedAt como string, no expone restaurantId ni userId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
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

  it('summary.counts es un objeto con keys por status', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { counts } = res.body.summary;
    expect(counts).toBeDefined();
    expect(counts.total).toBe(3);
    expect(counts.completed).toBe(2);
    expect(counts.cancelled).toBe(1);
    expect(counts.pending).toBe(0); // total - completed - cancelled
  });

  it('summary.revenue.collected refleja el total de órdenes pagadas en pesos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { revenue } = res.body.summary;
    expect(revenue).toBeDefined();
    // 2 órdenes pagadas × 1000 centavos = 2000 centavos = 20 pesos
    expect(revenue.collected).toBeCloseTo(20, 2);
  });

  it('summary.byPaymentMethod es un array con {method, count, total}', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { byPaymentMethod } = res.body.summary;
    expect(Array.isArray(byPaymentMethod)).toBe(true);
    for (const item of byPaymentMethod) {
      expect(typeof item.method).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(typeof item.total).toBe('number');
    }
  });

  it('summary tiene counts, revenue, byPaymentMethod, byOrderType, byOrderSource, topProducts', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { summary } = res.body;
    expect(summary.counts).toBeDefined();
    expect(summary.revenue).toBeDefined();
    expect(Array.isArray(summary.byPaymentMethod)).toBe(true);
    expect(Array.isArray(summary.byOrderType)).toBe(true);
    expect(Array.isArray(summary.byOrderSource)).toBe(true);
    expect(Array.isArray(summary.topProducts)).toBe(true);
  });

  describe('Cross-tenant (H-12)', () => {
    it('admin del restaurante A pidiendo summary de un sessionId del restaurante B recibe 404', async () => {
      await request(app.getHttpServer())
        .get(`/v1/cash-register/summary/${otherTenantShiftId}`)
        .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
        .expect(404);
    });
  });
});
