// test/orders/listOrders.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

describe('GET /v1/orders - listOrders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let adminTokenB: string;

  let shiftAId: string;
  let shiftBId: string;
  let restBShiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);

    // shiftA: 2 orders (orderNumber 1 = CREATED, orderNumber 2 = PROCESSING)
    const shiftA = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    shiftAId = shiftA.id;
    await seedOrder(prisma, restA.restaurant.id, shiftA.id, product.id);
    await seedOrder(prisma, restA.restaurant.id, shiftA.id, product.id, { status: 'PROCESSING' });

    // shiftB: 1 order (orderNumber 1 = CREATED)
    const shiftB = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    shiftBId = shiftB.id;
    await seedOrder(prisma, restA.restaurant.id, shiftB.id, product.id);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftRestB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    restBShiftId = shiftRestB.id;
    await seedOrder(prisma, restB.restaurant.id, shiftRestB.id, productB.id);
  });

  afterAll(async () => {
    await app.close();
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

  it('?statuses[]=CREATED&statuses[]=PROCESSING retorna solo órdenes con esos estados', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?statuses[]=CREATED&statuses[]=PROCESSING')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const allowed = new Set(['CREATED', 'PROCESSING']);
    expect(res.body.every((o: any) => allowed.has(o.status))).toBe(true);
  });

  it('Cada orden incluye items en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body[0].items)).toBe(true);
  });

  it('Cada orden incluye displayTime en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0].displayTime).toBe('string');
    expect(res.body[0].displayTime).toMatch(/^\d{2}:\d{2}$/);
  });

  // --- new tests ---

  it('?cashShiftId=shiftA → solo retorna órdenes de shiftA', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${shiftAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.cashShiftId === shiftAId)).toBe(true);
  });

  it('?cashShiftId=shiftB → solo retorna órdenes de shiftB', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${shiftBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.cashShiftId === shiftBId)).toBe(true);
  });

  it('?cashShiftId=<turno de restB> con token de restA → array vacío (aislamiento cross-restaurant)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${restBShiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('?orderNumber=1 → solo retorna órdenes con orderNumber=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?orderNumber=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.orderNumber === 1)).toBe(true);
  });

  it('?cashShiftId=shiftA&orderNumber=1 → retorna exactamente 1 orden', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${shiftAId}&orderNumber=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].cashShiftId).toBe(shiftAId);
    expect(res.body[0].orderNumber).toBe(1);
  });

  it('?limit=500 retorna máximo 100 órdenes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?limit=500')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it('?status=INVALID_VALUE → 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/orders?status=INVALID_VALUE')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
