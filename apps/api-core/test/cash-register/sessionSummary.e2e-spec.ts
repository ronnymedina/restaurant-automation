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
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CREATED');
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

  it('Retorna session, summary y orders', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe(shiftId);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  it('summary contiene ordersByStatus con las cuatro claves', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { ordersByStatus } = res.body.summary;
    expect(ordersByStatus).toBeDefined();
    for (const key of ['CREATED', 'PROCESSING', 'COMPLETED', 'CANCELLED']) {
      expect(ordersByStatus[key]).toBeDefined();
      expect(typeof ordersByStatus[key].count).toBe('number');
      expect(typeof ordersByStatus[key].total).toBe('number');
    }
  });

  it('totalSales excluye CANCELLED (suma CREATED + PROCESSING + COMPLETED en pesos)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { summary } = res.body;
    expect(typeof summary.totalSales).toBe('number');
    // 1 COMPLETED (1000 centavos) + 1 CREATED (1000 centavos) = 2000 centavos = 20 pesos
    expect(summary.totalSales).toBeCloseTo(20, 2);
  });

  it('totalOrders cuenta todas las órdenes de la sesión', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.totalOrders).toBe(3);
  });

  it('paymentBreakdown solo incluye métodos de órdenes COMPLETED, con totales en pesos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { paymentBreakdown } = res.body.summary;
    expect(paymentBreakdown).toBeDefined();
    for (const val of Object.values(paymentBreakdown) as any[]) {
      expect(typeof val.count).toBe('number');
      expect(typeof val.total).toBe('number');
    }
  });

  it('summary NO contiene completedOrders, cancelledOrders ni topProducts', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.completedOrders).toBeUndefined();
    expect(res.body.summary.cancelledOrders).toBeUndefined();
    expect(res.body.summary.topProducts).toBeUndefined();
  });

  it('ordersByStatus.CANCELLED count refleja las órdenes canceladas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.ordersByStatus.CANCELLED.count).toBe(1);
    expect(res.body.summary.ordersByStatus.COMPLETED.count).toBe(1);
    expect(res.body.summary.ordersByStatus.CREATED.count).toBe(1);
    expect(res.body.summary.ordersByStatus.PROCESSING.count).toBe(0);
  });
});
