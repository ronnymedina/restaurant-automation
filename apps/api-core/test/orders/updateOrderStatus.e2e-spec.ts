// test/orders/updateOrderStatus.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';
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
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', basicToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'PROCESSING' })
      .expect(403);
  });

  it('CREATED → CONFIRMED es transición válida → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    expect(res.body.status).toBe('CONFIRMED');
  });

  it('Transición inválida PROCESSING → CREATED → 400 INVALID_STATUS_TRANSITION', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'CREATED' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('SERVED sin pago → 409 ORDER_NOT_PAID', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'SERVED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
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
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
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
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'INVALID_STATUS' })
      .expect(400);
  });

  it('CONFIRMED → PROCESSING es transición válida → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'CONFIRMED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'PROCESSING' })
      .expect(200);

    expect(res.body.status).toBe('PROCESSING');
  });

  it('PROCESSING → SERVED es transición válida → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'SERVED' })
      .expect(200);

    expect(res.body.status).toBe('SERVED');
  });

  it('SERVED → COMPLETED con isPaid → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'SERVED', isPaid: true });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(res.body.status).toBe('COMPLETED');
  });

  it('Salto CREATED → PROCESSING → 400 INVALID_STATUS_TRANSITION', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Cookie', adminToken)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'PROCESSING' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});
