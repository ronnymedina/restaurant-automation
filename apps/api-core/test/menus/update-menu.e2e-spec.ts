/**
 * E2E: PATCH /v1/menus/:id
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot update
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot update menu from restaurant A
 *  - 400 name longer than 100 chars
 *  - 400 invalid startTime format
 *  - 200 ADMIN can update
 *  - 200 MANAGER can update
 *  - 200 serializer shape
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menus-update.db');

describe('PATCH /v1/menus/:id (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let menuId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'updateA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'updateB');
    adminTokenB = await login(app, seedB.admin.email);

    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Original' })
      .expect(201);

    menuId = res.body.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .send({ name: 'X' })
      .expect(401);
  });

  it('403 — BASIC cannot update a menu', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send({ name: 'X' })
      .expect(403);
  });

  it('404 — menu not found', async () => {
    await request(app.getHttpServer())
      .patch('/v1/menus/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'X' })
      .expect(404);
  });

  it('404 — restaurant B cannot update menu from restaurant A (isolation)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ name: 'Hack' })
      .expect(404);
  });

  it('400 — name longer than 100 characters is rejected', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'A'.repeat(101) })
      .expect(400);
  });

  it('400 — invalid startTime format is rejected', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ startTime: '9am' })
      .expect(400);
  });

  it('200 — ADMIN can update a menu', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Actualizado', active: false })
      .expect(200);

    expect(res.body.name).toBe('Menu Actualizado');
    expect(res.body.active).toBe(false);
  });

  it('200 — MANAGER can update a menu', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ name: 'Menu Manager Update' })
      .expect(200);

    expect(res.body.name).toBe('Menu Manager Update');
  });

  it('200 — serializer exposes correct fields', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ startTime: '08:00', endTime: '11:00', daysOfWeek: 'SAT,SUN' })
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.startTime).toBe('08:00');
    expect(res.body.endTime).toBe('11:00');
    expect(res.body.daysOfWeek).toBe('SAT,SUN');

    // absent
    expect(res.body.restaurantId).toBeUndefined();
    expect(res.body.createdAt).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
    expect(res.body.items).toBeUndefined();
  });
});
