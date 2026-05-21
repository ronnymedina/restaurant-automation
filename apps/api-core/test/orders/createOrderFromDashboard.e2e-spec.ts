// test/orders/createOrderFromDashboard.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift,
} from './orders.helpers';

describe('POST /v1/orders - createOrderFromDashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let closedAdminToken: string;
  let closedRestaurantId: string;
  let closedCategoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    // Main restaurant — shift opened once, reused by all tests that need it
    const rest = await seedRestaurant(prisma, 'DASH');
    adminToken = await login(app, rest.admin.email);
    managerToken = await login(app, rest.manager.email);
    basicToken = await login(app, rest.basic.email);
    restaurantId = rest.restaurant.id;
    categoryId = rest.category.id;
    await openCashShift(prisma, restaurantId, rest.admin.id);

    // Closed restaurant — intentionally no shift, used only for the 409 test
    const closedRest = await seedRestaurant(prisma, 'CLOSED');
    closedAdminToken = await login(app, closedRest.admin.email);
    closedRestaurantId = closedRest.restaurant.id;
    closedCategoryId = closedRest.category.id;
  });

  afterAll(async () => { await app.close(); });

  it('Sin token → 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .send({ items: [], orderType: 'PICKUP' })
      .expect(401);
  });

  it('BASIC → 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${basicToken}`)
      .send({ items: [], orderType: 'PICKUP' })
      .expect(403);
  });

  it('Sin caja abierta → 409 REGISTER_NOT_OPEN', async () => {
    const product = await seedProduct(prisma, closedRestaurantId, closedCategoryId);
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${closedAdminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(409);
  });

  it('ADMIN crea pedido → 201, status CONFIRMED, orderSource STAFF', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const res = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(201);

    expect(res.body.order.status).toBe('CONFIRMED');
    expect(res.body.order.orderSource).toBe('STAFF');
    expect(res.body.order.orderNumber).toBeGreaterThan(0);
  });

  it('MANAGER crea pedido → 201', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const res = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(201);

    expect(res.body.order.orderSource).toBe('STAFF');
  });

  it('DELIVERY sin deliveryAddress → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'DELIVERY',
      })
      .expect(400);
  });

  it('Producto sin stock → 409', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId, { stock: 0 });

    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(409);
  });

  it('orderSource del body es ignorado — siempre queda STAFF', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const res = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
        orderSource: 'KIOSK', // intento de sobrescribir — debe ignorarse
      })
      .expect(201);

    expect(res.body.order.orderSource).toBe('STAFF');
  });
});

describe('PATCH /v1/orders/:id/pay con paymentMethod (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let restaurantId: string;
  let categoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    const rest = await seedRestaurant(prisma, 'PAY');
    adminToken = await login(app, rest.admin.email);
    restaurantId = rest.restaurant.id;
    categoryId = rest.category.id;
    // Open shift once — reused by all tests in this describe
    await openCashShift(prisma, restaurantId, rest.admin.id);
  });

  afterAll(async () => { await app.close(); });

  it('/pay sin body → 200, paymentMethod sigue null', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const created = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], orderType: 'PICKUP' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${created.body.order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.isPaid).toBe(true);
    expect(res.body.paymentMethod).toBeNull();
  });

  it('/pay con paymentMethod: CASH → 200, paymentMethod guardado', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const created = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], orderType: 'PICKUP' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${created.body.order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: 'CASH' })
      .expect(200);

    expect(res.body.isPaid).toBe(true);
    expect(res.body.paymentMethod).toBe('CASH');
  });

  it('/pay con valor inválido → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const created = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], orderType: 'PICKUP' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${created.body.order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: 'BITCOIN' })
      .expect(400);
  });
});
