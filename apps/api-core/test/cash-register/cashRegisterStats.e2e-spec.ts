// test/cash-register/cashRegisterStats.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
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
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);
  });

  it('Sin sesión abierta retorna zeros (no error)', async () => {
    const rest = await seedRestaurant(prisma, 'NoShift');
    const token = await login(app, rest.admin.email);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.total).toBe(0);
    expect(res.body.pending).toBe(0);
    expect(res.body.counts).toEqual([]);
    expect(res.body.revenue.completed).toBe(0);
    expect(res.body.revenue.averageTicket).toBe(0);
    expect(res.body.topProducts).toEqual([]);
    expect(res.body.byPaymentMethod).toEqual([]);
  });

  it('Retorna todos los campos requeridos con una sesión abierta', async () => {
    const rest = await seedRestaurant(prisma, 'FullFields');
    const token = await login(app, rest.admin.email);
    await openCashShiftViaApi(app, token);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      total:   expect.any(Number),
      pending: expect.any(Number),
      counts:  expect.any(Array),
      revenue: {
        completed:     expect.any(Number),
        pending:       expect.any(Number),
        averageTicket: expect.any(Number),
      },
      byPaymentMethod: expect.any(Array),
      byOrderType:     expect.any(Array),
      byOrderSource:   expect.any(Array),
      topProducts:     expect.any(Array),
    });
  });

  it('pending = total - completed - cancelled', async () => {
    const rest = await seedRestaurant(prisma, 'PendingCalc');
    const token   = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED');

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.pending).toBe(1); // 3 - 1 completed - 1 cancelled
    expect(res.body.counts).toEqual(
      expect.arrayContaining([
        { status: 'CREATED',   total: 1 },
        { status: 'COMPLETED', total: 1 },
        { status: 'CANCELLED', total: 1 },
      ]),
    );
  });

  it('revenue.completed solo cuenta órdenes COMPLETED', async () => {
    const rest = await seedRestaurant(prisma, 'RevenueCalc');
    const token   = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED');

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // product price = 1000 centavos = 10.0; solo 1 COMPLETED
    expect(res.body.revenue.completed).toBe(10);
    // pending = 1 CREATED = 10.0; CANCELLED excluida
    expect(res.body.revenue.pending).toBe(10);
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
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.topProducts.length).toBeLessThanOrEqual(5);
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
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resB.body.total).toBe(0);
    expect(resB.body.counts).toEqual([]);
    expect(resB.body.revenue.completed).toBe(0);
  });
});
