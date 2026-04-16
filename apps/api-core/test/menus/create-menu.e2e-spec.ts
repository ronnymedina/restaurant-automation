/**
 * E2E: POST /v1/menus
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot create
 *  - 400 name empty
 *  - 400 name longer than 100 chars
 *  - 400 invalid startTime format
 *  - 400 invalid daysOfWeek
 *  - 201 ADMIN can create
 *  - 201 MANAGER can create
 *  - 201 serializer shape (fields present and absent)
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menus-create.db');

describe('POST /v1/menus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'createA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus')
      .send({ name: 'Test' })
      .expect(401);
  });

  it('403 — BASIC cannot create a menu', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send({ name: 'Test BASIC' })
      .expect(403);
  });

  it('400 — empty name is rejected', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: '' })
      .expect(400);
  });

  it('400 — name longer than 100 characters is rejected', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'A'.repeat(101) })
      .expect(400);
  });

  it('400 — invalid startTime format is rejected', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Test', startTime: '1200' })
      .expect(400);
  });

  it('400 — invalid daysOfWeek value is rejected', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Test', daysOfWeek: 'MONDAY,TUESDAY' })
      .expect(400);
  });

  it('201 — ADMIN can create a menu', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        name: 'Almuerzo Admin',
        startTime: '12:00',
        endTime: '15:00',
        daysOfWeek: 'MON,TUE,WED,THU,FRI',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Almuerzo Admin');
    expect(res.body.active).toBe(true);
    expect(res.body.startTime).toBe('12:00');
    expect(res.body.endTime).toBe('15:00');
    expect(res.body.daysOfWeek).toBe('MON,TUE,WED,THU,FRI');

    // absent
    expect(res.body.restaurantId).toBeUndefined();
    expect(res.body.createdAt).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
    expect(res.body.items).toBeUndefined();
    expect(res.body.itemsCount).toBeUndefined();
  });

  it('201 — MANAGER can create a menu', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ name: 'Menu Manager' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Menu Manager');
  });

  it('201 — active defaults to true when not provided', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Activo Default' })
      .expect(201);

    expect(res.body.active).toBe(true);
  });

  it('201 — menu can be created inactive', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Inactivo', active: false })
      .expect(201);

    expect(res.body.active).toBe(false);
  });

  it('201 — optional fields are null when not provided', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Minimo' })
      .expect(201);

    expect(res.body.startTime).toBeNull();
    expect(res.body.endTime).toBeNull();
    expect(res.body.daysOfWeek).toBeNull();
  });
});
