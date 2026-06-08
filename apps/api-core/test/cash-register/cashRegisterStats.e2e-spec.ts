// test/cash-register/cashRegisterStats.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

describe('GET /v1/cash-register/stats (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    const rest = await seedRestaurant(prisma, 'NoAuth');
    const token = await login(app, rest.admin.email);
    await openCashShiftViaApi(app, token);

    await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .expect(401);
  });

  it('BASIC puede ver las stats', async () => {
    const rest = await seedRestaurant(prisma, 'BasicStats');
    const adminToken = await login(app, rest.admin.email);
    const basicToken = await login(app, rest.basic.email);
    await openCashShiftViaApi(app, adminToken);

    await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', basicToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);
  });

  it('Sin sesión abierta retorna summary en zeros (no error)', async () => {
    const rest = await seedRestaurant(prisma, 'NoShift');
    const token = await login(app, rest.admin.email);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { summary } = res.body;
    expect(summary).toBeDefined();
    expect(summary.counts.total).toBe(0);
    expect(summary.counts.pending).toBe(0);
    expect(summary.counts.completed).toBe(0);
    expect(summary.counts.cancelled).toBe(0);
    expect(summary.revenue.collected).toBe(0);
    expect(summary.revenue.averageTicket).toBe(0);
    expect(summary.topProducts).toEqual([]);
    expect(summary.byPaymentMethod).toEqual([]);
  });

  it('Retorna todos los campos requeridos con una sesión abierta', async () => {
    const rest = await seedRestaurant(prisma, 'FullFields');
    const token = await login(app, rest.admin.email);
    await openCashShiftViaApi(app, token);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body.summary).toMatchObject({
      counts: {
        total: expect.any(Number),
        completed: expect.any(Number),
        cancelled: expect.any(Number),
        pending: expect.any(Number),
      },
      revenue: {
        collected:     expect.any(Number),
        pending:       expect.any(Number),
        averageTicket: expect.any(Number),
      },
      byPaymentMethod: expect.any(Array),
      byOrderType:     expect.any(Array),
      byOrderSource:   expect.any(Array),
      topProducts:     expect.any(Array),
    });
  });

  it('counts.pending = counts.total - counts.completed - counts.cancelled', async () => {
    const rest = await seedRestaurant(prisma, 'PendingCalc');
    const token   = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED');

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { counts } = res.body.summary;
    expect(counts.total).toBe(3);
    expect(counts.pending).toBe(1); // 3 - 1 completed - 1 cancelled
    expect(counts.created).toBe(1);
    expect(counts.completed).toBe(1);
    expect(counts.cancelled).toBe(1);
  });

  it('revenue.collected solo cuenta órdenes pagadas (isPaid)', async () => {
    const rest = await seedRestaurant(prisma, 'RevenueCalc');
    const token   = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    // COMPLETED siempre es paid (invariante de dominio)
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED', true);
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED', false);
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED', false);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { revenue } = res.body.summary;
    // product price = 1000 centavos = 10.0; solo 1 orden pagada
    expect(revenue.collected).toBe(10);
    // pending = 1 CREATED no pagada = 10.0; CANCELLED excluida
    expect(revenue.pending).toBe(10);
  });

  it('topProducts tiene máximo 5 elementos', async () => {
    const rest    = await seedRestaurant(prisma, 'TopProds');
    const token   = await login(app, rest.admin.email);
    const shiftId = await openCashShiftViaApi(app, token);

    for (let i = 0; i < 6; i++) {
      const p = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
      await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, p.id, 'COMPLETED');
    }

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body.summary.topProducts.length).toBeLessThanOrEqual(5);
  });

  it('aislamiento por restaurante — no mezcla stats de otro restaurante', async () => {
    const restA   = await seedRestaurant(prisma, 'IsoA');
    const restB   = await seedRestaurant(prisma, 'IsoB');
    const tokenA  = await login(app, restA.admin.email);
    const tokenB  = await login(app, restB.admin.email);
    const productA = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shiftAId = await openCashShiftViaApi(app, tokenA);
    await openCashShiftViaApi(app, tokenB);

    await seedOrderOnShift(prisma, restA.restaurant.id, shiftAId, productA.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftAId, productA.id, 'COMPLETED');

    const resB = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Cookie', tokenB)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const { summary } = resB.body;
    expect(summary.counts.total).toBe(0);
    expect(summary.counts.completed).toBe(0);
    expect(summary.revenue.collected).toBe(0);
  });
});
