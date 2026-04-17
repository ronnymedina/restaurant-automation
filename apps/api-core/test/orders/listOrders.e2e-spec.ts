// test/orders/listOrders.e2e-spec.ts
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

const TEST_DB = path.resolve(__dirname, 'test-list-orders.db');

describe('GET /v1/orders - listOrders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id);
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id, { status: 'PROCESSING' });

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/orders').expect(401);
  });

  it('ADMIN puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('MANAGER puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('BASIC puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('Solo retorna órdenes del propio restaurante (aislamiento)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    const idsA = resA.body.map((o: any) => o.id);
    const idsB = resB.body.map((o: any) => o.id);
    expect(idsA.some((id: string) => idsB.includes(id))).toBe(false);
  });

  it('Filtro por ?status=CREATED retorna solo órdenes CREATED', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?status=CREATED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.every((o: any) => o.status === 'CREATED')).toBe(true);
  });

  it('Cada orden incluye items en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body[0].items)).toBe(true);
  });
});
