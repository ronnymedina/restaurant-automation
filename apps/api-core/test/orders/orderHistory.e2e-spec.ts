// test/orders/orderHistory.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-order-history.db');

describe('GET /v1/orders/history - orderHistory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminTokenB: string;
  let orderId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);

    const order = await seedOrder(prisma, restA.restaurant.id, shift.id, product.id);
    orderId = order.id;
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id, { status: 'PROCESSING' });
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id, { status: 'CANCELLED' });

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/orders/history').expect(401);
  });

  it('Retorna estructura paginada { data, meta }', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.page).toBe('number');
    expect(typeof res.body.meta.limit).toBe('number');
    expect(typeof res.body.meta.totalPages).toBe('number');
  });

  it('Paginación: page=1&limit=1 retorna 1 resultado y meta correcta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('Filtro por status=CANCELLED retorna solo canceladas', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?status=CANCELLED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((o: any) => o.status === 'CANCELLED')).toBe(true);
  });

  it('Filtro por orderNumber retorna la orden específica', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?orderNumber=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.some((o: any) => o.orderNumber === 1)).toBe(true);
  });

  it('Solo retorna órdenes del propio restaurante (aislamiento)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/orders/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/orders/history')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(resB.body.meta.total).toBe(0);
    expect(resA.body.meta.total).toBeGreaterThan(0);
  });
});
