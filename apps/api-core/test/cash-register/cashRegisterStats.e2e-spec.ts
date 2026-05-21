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

    expect(res.body.counts.total).toBe(0);
    expect(res.body.counts.pending).toBe(0);
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
      counts: {
        total:      expect.any(Number),
        created:    expect.any(Number),
        confirmed:  expect.any(Number),
        processing: expect.any(Number),
        served:     expect.any(Number),
        completed:  expect.any(Number),
        cancelled:  expect.any(Number),
        pending:    expect.any(Number),
      },
      revenue: {
        completed:    expect.any(Number),
        pending:      expect.any(Number),
        averageTicket: expect.any(Number),
      },
      byPaymentMethod: expect.any(Array),
      byOrderType:     expect.any(Array),
      byOrderSource:   expect.any(Array),
      topProducts:     expect.any(Array),
    });
  });

  it('counts.pending = total - completed - cancelled', async () => {
    const rest = await seedRestaurant(prisma, 'PendingCalc');
    const token  = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED');

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { counts } = res.body;
    expect(counts.total).toBe(3);
    expect(counts.completed).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.pending).toBe(counts.total - counts.completed - counts.cancelled);
  });

  it('revenue.completed solo cuenta órdenes COMPLETED', async () => {
    const rest = await seedRestaurant(prisma, 'RevenueCalc');
    const token  = await login(app, rest.admin.email);
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
    const rest = await seedRestaurant(prisma, 'TopProds');
    const token  = await login(app, rest.admin.email);
    const shiftId = await openCashShiftViaApi(app, token);

    // Crear 6 productos distintos y un pedido COMPLETED para cada uno
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
    const restA = await seedRestaurant(prisma, 'IsoA');
    const restB = await seedRestaurant(prisma, 'IsoB');
    const tokenA = await login(app, restA.admin.email);
    const tokenB = await login(app, restB.admin.email);
    const productA = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shiftAId = await openCashShiftViaApi(app, tokenA);
    await openCashShiftViaApi(app, tokenB);

    // Solo RestA tiene órdenes
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftAId, productA.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftAId, productA.id, 'COMPLETED');

    const resB = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // RestB no tiene órdenes — sus stats deben estar en cero
    expect(resB.body.counts.total).toBe(0);
    expect(resB.body.revenue.completed).toBe(0);
  });
});
