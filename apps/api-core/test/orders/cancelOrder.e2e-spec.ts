// test/orders/cancelOrder.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';


describe('PATCH /v1/orders/:id/cancel - cancelOrder (e2e)', () => {
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
      .patch(`/v1/orders/${order.id}/cancel`)
      .send({ reason: 'Test' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${basicToken}`)
      .send({ reason: 'Test' })
      .expect(403);
  });

  it('ADMIN cancela orden CREATED → 200, status: CANCELLED', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Pedido duplicado' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancellationReason).toBe('Pedido duplicado');
  });

  it('ADMIN cancela orden PROCESSING → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Cliente cambió de opinión' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
  });

  it('Orden ya cancelada → 409 ORDER_ALREADY_CANCELLED', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'CANCELLED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Intento de cancelación doble' })
      .expect(409);

    expect(res.body.code).toBe('ORDER_ALREADY_CANCELLED');
  });

  it('Orden COMPLETED → 400 INVALID_STATUS_TRANSITION', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'COMPLETED', isPaid: true });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'No se puede cancelar completada' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('reason vacío → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '' })
      .expect(400);
  });
});
