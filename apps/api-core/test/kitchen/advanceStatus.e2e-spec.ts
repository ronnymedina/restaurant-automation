// test/kitchen/advanceStatus.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurantWithToken, openCashShift, seedProduct, seedOrder,
} from './kitchen.helpers';
import { ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';

describe('PATCH /v1/kitchen/:slug/orders/:id/status - advanceStatus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let token: string;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    const rest = await seedRestaurantWithToken(prisma, 'K');
    slug = rest.slug;
    token = rest.token;
    restaurantId = rest.restaurant.id;
    categoryId = rest.category.id;
    adminId = rest.admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/kitchen/${slug}/orders/${order.id}/status`)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'PROCESSING' })
      .expect(401);
  });

  it('CONFIRMED → PROCESSING es válido → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'CONFIRMED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/kitchen/${slug}/orders/${order.id}/status`)
      .set('X-Kitchen-Token', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'PROCESSING' })
      .expect(200);

    expect(res.body.status).toBe('PROCESSING');
  });

  it('PROCESSING → SERVED es válido → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/kitchen/${slug}/orders/${order.id}/status`)
      .set('X-Kitchen-Token', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'SERVED' })
      .expect(200);

    expect(res.body.status).toBe('SERVED');
  });

  it('SERVED → COMPLETED rechazado desde cocina → 400 (DTO rechaza COMPLETED)', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'SERVED' });

    await request(app.getHttpServer())
      .patch(`/v1/kitchen/${slug}/orders/${order.id}/status`)
      .set('X-Kitchen-Token', token)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ status: 'COMPLETED' })
      .expect(400);
  });
});
