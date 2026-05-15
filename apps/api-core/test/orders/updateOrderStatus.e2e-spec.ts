// test/orders/updateOrderStatus.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';


describe('PATCH /v1/orders/:id/status - updateOrderStatus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .send({ status: 'PROCESSING' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${basicToken}`)
      .send({ status: 'PROCESSING' })
      .expect(403);
  });

  it('CREATED → PROCESSING es transición válida → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(200);

    expect(res.body.status).toBe('PROCESSING');
  });

  it('Transición inválida PROCESSING → CREATED → 400 INVALID_STATUS_TRANSITION', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CREATED' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('Completar orden sin pago → 409 ORDER_NOT_PAID', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);

    expect(res.body.code).toBe('ORDER_NOT_PAID');
  });

  it('Orden ya cancelada → 409 ORDER_ALREADY_CANCELLED', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'CANCELLED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(409);

    expect(res.body.code).toBe('ORDER_ALREADY_CANCELLED');
  });

  it('status inválido en body → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INVALID_STATUS' })
      .expect(400);
  });
});
