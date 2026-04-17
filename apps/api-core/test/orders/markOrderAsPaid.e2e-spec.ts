// test/orders/markOrderAsPaid.e2e-spec.ts
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

const TEST_DB = path.resolve(__dirname, 'test-mark-paid.db');

describe('PATCH /v1/orders/:id/pay - markOrderAsPaid (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;
  let orderIdFromB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;

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
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/pay`)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('ADMIN marca orden como pagada → 200, isPaid: true', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.isPaid).toBe(true);
    expect(res.body.id).toBe(order.id);
  });

  it('Orden de otro restaurante → 404', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/orders/${orderIdFromB}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('Orden inexistente → 404', async () => {
    await request(app.getHttpServer())
      .patch('/v1/orders/non-existent-id/pay')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
