// test/kiosk/kioskCreateOrder.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, seedProduct, openCashShift,
} from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-create-order.db');

describe('POST /v1/kiosk/:slug/orders - kioskCreateOrder (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let slugNoShift: string;
  let productId: string;
  let productIdLowStock: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    // Restaurant with open cash shift
    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    productId = product.id;

    // Product with stock = 1 for stock test
    const lowStockProduct = await seedProduct(prisma, restA.restaurant.id, restA.category.id, { stock: 1 });
    productIdLowStock = lowStockProduct.id;

    await openCashShift(prisma, restA.restaurant.id, restA.admin.id);

    // Restaurant without open shift
    const restB = await seedRestaurant(prisma, 'B');
    slugNoShift = restB.restaurant.slug;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .post('/v1/kiosk/slug-inexistente/orders')
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(404);
  });

  it('Sin caja abierta → 409 NO_OPEN_CASH_REGISTER', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slugNoShift}/orders`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(409);

    expect(res.body.code).toBe('NO_OPEN_CASH_REGISTER');
  });

  it('Crea orden exitosamente → 201', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    expect(res.body.order).toBeDefined();
    expect(res.body.order.id).toBeDefined();
    expect(res.body.order.status).toBe('CREATED');
    expect(typeof res.body.order.orderNumber).toBe('number');
  });

  it('Stock insuficiente → 409 STOCK_INSUFFICIENT', async () => {
    // First order consumes the stock=1 product
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId: productIdLowStock, quantity: 1 }] })
      .expect(201);

    // Second order should fail — stock is now 0
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId: productIdLowStock, quantity: 1 }] })
      .expect(409);

    expect(res.body.code).toBe('STOCK_INSUFFICIENT');
  });

  it('items vacío → 201 (no hay validación de array mínimo)', async () => {
    // The DTO does not enforce @ArrayMinSize(1), so an empty items array
    // creates an order with totalAmount=0. The API returns 201.
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [] })
      .expect(201);

    expect(res.body.order).toBeDefined();
    expect(res.body.order.status).toBe('CREATED');
  });

  it('quantity < 1 → 400', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 0 }] })
      .expect(400);
  });

  it('expectedTotal en pesos coincide con el total → 201 (H-01 regression)', async () => {
    // seedProduct price is BigInt(1000) centavos = $10. 2 units = $20 expected.
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 2 }], expectedTotal: 20 })
      .expect(201);

    expect(res.body.order.totalAmount).toBe(20); // serialized in pesos
  });

  it('expectedTotal en pesos NO coincide → 400 (H-01 regression)', async () => {
    // Product is $10. Sending expectedTotal: 5 (pesos) for 1 unit should fail.
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 1 }], expectedTotal: 5 })
      .expect(400);
  });

  it('notes >500 caracteres → 400 (H-03 regression)', async () => {
    // Defense in depth — frontend should escape, but backend caps free-text fields
    // to bound DoS via huge payloads and limit blast radius of any future renderer mistake.
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 1, notes: 'x'.repeat(501) }] })
      .expect(400);
  });

  it('notes exactamente 500 caracteres → 201 (H-03 regression boundary)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 1, notes: 'x'.repeat(500) }] })
      .expect(201);
  });
});
