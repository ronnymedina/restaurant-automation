/**
 * E2E: DELETE /v1/menus/:id
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot delete
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot delete menu from restaurant A
 *  - 204 ADMIN can delete (no body)
 *  - 204 MANAGER can delete (no body)
 *  - soft delete: deleted menu excluded from list and returns 404 on GET
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menus-delete.db');

describe('DELETE /v1/menus/:id (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'deleteA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'deleteB');
    adminTokenB = await login(app, seedB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu 401 test' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/menus/${res.body.id}`)
      .expect(401);
  });

  it('403 — BASIC cannot delete a menu', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu 403 test' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/menus/${res.body.id}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(403);
  });

  it('404 — menu not found', async () => {
    await request(app.getHttpServer())
      .delete('/v1/menus/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('404 — restaurant B cannot delete menu from restaurant A (isolation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu isolation test' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/menus/${res.body.id}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });

  it('204 — ADMIN can delete a menu and response has no body', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu para Admin delete' })
      .expect(201);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/v1/menus/${res.body.id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    expect(deleteRes.body).toEqual({});
  });

  it('204 — MANAGER can delete a menu', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu para Manager delete' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/menus/${res.body.id}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(204);
  });

  it('soft delete — deleted menu not returned in list', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu soft delete list' })
      .expect(201);

    const menuId = res.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const listRes = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const found = listRes.body.find((m: { id: string }) => m.id === menuId);
    expect(found).toBeUndefined();
  });

  it('soft delete — deleted menu returns 404 on GET', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu soft delete get' })
      .expect(201);

    const menuId = res.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('soft delete — record preserved in DB with deletedAt set', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu soft delete db' })
      .expect(201);

    const menuId = res.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const record = await prisma.menu.findUnique({ where: { id: menuId } });
    expect(record).not.toBeNull();
    expect(record!.deletedAt).not.toBeNull();
  });
});
