// test/orders/findOneOrder.e2e-spec.ts
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

const TEST_DB = path.resolve(__dirname, 'test-find-one-order.db');

describe('GET /v1/orders/:id - findOneOrder (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let orderId: string;
  let orderIdFromB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    const order = await seedOrder(prisma, restA.restaurant.id, shift.id, product.id);
    orderId = order.id;

    const restB = await seedRestaurant(prisma, 'B');
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    const orderB = await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);
    orderIdFromB = orderB.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get(`/v1/orders/${orderId}`).expect(401);
  });

  it('ADMIN puede obtener la orden → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
  });

  it('MANAGER puede obtener la orden → 200', async () => {
    await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
  });

  it('BASIC puede obtener la orden → 200', async () => {
    await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);
  });

  it('Respuesta incluye items[]', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('Orden de otro restaurante → 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderIdFromB}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('Orden inexistente → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });
});
