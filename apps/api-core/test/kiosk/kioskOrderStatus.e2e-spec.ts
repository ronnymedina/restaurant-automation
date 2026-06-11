// test/kiosk/kioskOrderStatus.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, seedProduct, openCashShift } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-order-status.db');

describe('GET /v1/kiosk/:slug/orders/:orderId - kioskOrderStatus (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let orderId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    await openCashShift(prisma, restA.restaurant.id, restA.admin.id);

    // Create an order via kiosk to get a real orderId
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    orderId = res.body.order.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Orden inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/orders/id-inexistente`)
      .expect(404);
  });

  it('Retorna estado de la orden → 200', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/orders/${orderId}`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
    expect(res.body.status).toBe('CREATED');
    expect(typeof res.body.orderNumber).toBe('number');
    expect(typeof res.body.totalAmount).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.createdAt).toBeDefined();
  });

  it('Orden de otro restaurante vía slug ajeno → 404 (R2-12)', async () => {
    // Restaurante B con su propia orden
    const restB = await seedRestaurant(prisma, 'B');
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    const resB = await request(app.getHttpServer())
      .post(`/v1/kiosk/${restB.restaurant.slug}/orders`)
      .send({ items: [{ productId: productB.id, quantity: 1 }] })
      .expect(201);
    const orderIdB = resB.body.order.id;

    // Consultar la orden de B usando el slug de A → no debe filtrarse
    await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/orders/${orderIdB}`)
      .expect(404);
  });
});
