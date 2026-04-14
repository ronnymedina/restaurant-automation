/**
 * E2E: GET /v1/menus
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 200 ADMIN, MANAGER, BASIC can list
 *  - 200 isolation — only own restaurant menus
 *  - 200 serializer shape (fields present and absent)
 *  - 200 soft-deleted menus excluded
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menus-list.db');

describe('GET /v1/menus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'listA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'listB');
    adminTokenB = await login(app, seedB.admin.email);

    // Create menus for restaurant A
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Almuerzo', startTime: '12:00', endTime: '15:00', daysOfWeek: 'MON,TUE,WED,THU,FRI' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Cena', active: false })
      .expect(201);

    // Create menu for restaurant B (isolation)
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ name: 'Menu B' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer()).get('/v1/menus').expect(401);
  });

  it('200 — ADMIN can list menus', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('200 — MANAGER can list menus', async () => {
    await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(200);
  });

  it('200 — BASIC can list menus', async () => {
    await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(200);
  });

  it('200 — serializer exposes correct fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const menu = res.body.find((m: { name: string }) => m.name === 'Almuerzo');
    expect(menu).toBeDefined();

    // present
    expect(menu.id).toBeDefined();
    expect(menu.name).toBe('Almuerzo');
    expect(typeof menu.active).toBe('boolean');
    expect(menu.startTime).toBe('12:00');
    expect(menu.endTime).toBe('15:00');
    expect(menu.daysOfWeek).toBe('MON,TUE,WED,THU,FRI');
    expect(typeof menu.itemsCount).toBe('number');

    // absent
    expect(menu.restaurantId).toBeUndefined();
    expect(menu.createdAt).toBeUndefined();
    expect(menu.updatedAt).toBeUndefined();
    expect(menu.deletedAt).toBeUndefined();
  });

  it('200 — only returns menus from own restaurant (isolation)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    const idsA = resA.body.map((m: { id: string }) => m.id);
    const idsB = resB.body.map((m: { id: string }) => m.id);

    idsA.forEach((id: string) => expect(idsB).not.toContain(id));
  });

  it('200 — soft-deleted menus are excluded', async () => {
    // Create and soft-delete a menu
    const createRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu para eliminar' })
      .expect(201);

    const menuId = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const found = res.body.find((m: { id: string }) => m.id === menuId);
    expect(found).toBeUndefined();
  });

  it('200 — itemsCount reflects actual item count', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const menu = res.body.find((m: { name: string }) => m.name === 'Almuerzo');
    expect(menu.itemsCount).toBe(0);
  });
});
