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

  describe('Filtro por fecha con timezone (America/Mexico_City)', () => {
    let tzToken: string;
    let orderInDayId: string;
    let orderOutBeforeId: string;
    let orderOutAfterId: string;

    beforeAll(async () => {
      // Separate restaurant with Mexico City timezone (UTC-6 in January)
      const rest = await seedRestaurant(prisma, 'TZ');
      tzToken = await login(app, rest.admin.email);

      await prisma.restaurantSettings.update({
        where: { restaurantId: rest.restaurant.id },
        data: { timezone: 'America/Mexico_City' },
      });

      const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
      const shift = await openCashShift(prisma, rest.restaurant.id, rest.admin.id);

      // Jan 14, 23:59:59 Mexico City = 2026-01-15T05:59:59Z (NOT in Jan 15 local)
      const before = await seedOrder(prisma, rest.restaurant.id, shift.id, product.id, {
        createdAt: new Date('2026-01-15T05:59:59.000Z'),
      });
      orderOutBeforeId = before.id;

      // Jan 15, 00:00:00 Mexico City = 2026-01-15T06:00:00Z (IS in Jan 15 local)
      const inside = await seedOrder(prisma, rest.restaurant.id, shift.id, product.id, {
        createdAt: new Date('2026-01-15T06:00:00.000Z'),
      });
      orderInDayId = inside.id;

      // Jan 16, 00:00:00 Mexico City = 2026-01-16T06:00:00Z (NOT in Jan 15 local)
      const after = await seedOrder(prisma, rest.restaurant.id, shift.id, product.id, {
        createdAt: new Date('2026-01-16T06:00:00.000Z'),
      });
      orderOutAfterId = after.id;
    });

    it('?dateFrom=2026-01-15&dateTo=2026-01-15 incluye solo órdenes del día local', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/orders/history?dateFrom=2026-01-15&dateTo=2026-01-15')
        .set('Authorization', `Bearer ${tzToken}`)
        .expect(200);

      const ids = res.body.data.map((o: any) => o.id);
      expect(ids).toContain(orderInDayId);
      expect(ids).not.toContain(orderOutBeforeId);
      expect(ids).not.toContain(orderOutAfterId);
    });

    it('?dateFrom=2026-01-15 excluye órdenes anteriores al inicio del día local', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/orders/history?dateFrom=2026-01-15')
        .set('Authorization', `Bearer ${tzToken}`)
        .expect(200);

      const ids = res.body.data.map((o: any) => o.id);
      expect(ids).not.toContain(orderOutBeforeId);
      expect(ids).toContain(orderInDayId);
    });

    it('?dateTo=2026-01-15 excluye órdenes posteriores al fin del día local', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/orders/history?dateTo=2026-01-15')
        .set('Authorization', `Bearer ${tzToken}`)
        .expect(200);

      const ids = res.body.data.map((o: any) => o.id);
      expect(ids).not.toContain(orderOutAfterId);
      expect(ids).toContain(orderOutBeforeId);
      expect(ids).toContain(orderInDayId);
    });
  });
});
