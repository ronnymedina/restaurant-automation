// test/cash-register/topProducts.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

describe('GET /v1/cash-register/top-products/:sessionId (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'TP');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sesión inexistente → 404 REGISTER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/top-products/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('REGISTER_NOT_FOUND');
  });

  it('Retorna topProducts array con máx 5 elementos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.topProducts)).toBe(true);
    expect(res.body.topProducts.length).toBeLessThanOrEqual(5);
  });

  it('Cada elemento tiene id, name, quantity (number) y total (pesos decimal)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    if (res.body.topProducts.length > 0) {
      const top = res.body.topProducts[0];
      expect(top.id).toBeDefined();
      expect(typeof top.name).toBe('string');
      expect(typeof top.quantity).toBe('number');
      expect(typeof top.total).toBe('number');
    }
  });

  it('Excluye ítems de órdenes CANCELLED — solo 1 producto visible (del COMPLETED)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Both orders use the same product, but CANCELLED is excluded.
    // Quantity should be 1 (only the COMPLETED order item).
    expect(res.body.topProducts).toHaveLength(1);
    expect(res.body.topProducts[0].quantity).toBe(1);
  });

  it('total está en pesos (1000 centavos → 10 pesos)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.topProducts[0].total).toBeCloseTo(10, 2);
  });
});
