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
  let adminTokenNoShift: string;

  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    // restA: un turno abierto con 2 órdenes (CREATED y PROCESSING)
    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    shiftId = shift.id;
    await seedOrder(prisma, restA.restaurant.id, shiftId, product.id);
    await seedOrder(prisma, restA.restaurant.id, shiftId, product.id, { status: 'PROCESSING' });

    // restB: un turno abierto con 1 orden → para probar aislamiento
    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);

    // restC: sin turno abierto → para probar 409
    const restC = await seedRestaurant(prisma, 'C');
    adminTokenNoShift = await login(app, restC.admin.email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/orders').expect(401);
  });

  it('Sin caja abierta recibe 409 con code REGISTER_NOT_OPEN', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminTokenNoShift}`)
      .expect(409);
    expect(res.body.code).toBe('REGISTER_NOT_OPEN');
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

  it('?statuses=CREATED retorna solo órdenes CREATED', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?statuses=CREATED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.every((o: any) => o.status === 'CREATED')).toBe(true);
  });

  it('?statuses=CREATED&statuses=PROCESSING retorna solo órdenes con esos estados', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?statuses=CREATED&statuses=PROCESSING')
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

  it('Retorna órdenes del turno activo (cashShiftId coincide con el turno abierto)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.cashShiftId === shiftId)).toBe(true);
  });

  it('?orderNumber=1 → solo retorna órdenes con orderNumber=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?orderNumber=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.orderNumber === 1)).toBe(true);
  });

  it('?limit=500 retorna máximo 100 órdenes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?limit=500')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it('?statuses=INVALID_VALUE → 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/orders?statuses=INVALID_VALUE')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
