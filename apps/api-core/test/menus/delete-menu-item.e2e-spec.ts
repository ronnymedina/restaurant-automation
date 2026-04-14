/**
 * E2E: DELETE /v1/menus/:menuId/items/:itemId
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot delete
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot delete item from menu of restaurant A
 *  - 204 ADMIN can delete (no body)
 *  - 204 MANAGER can delete (no body)
 *  - item is removed from menu after deletion
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menu-items-delete.db');

describe('DELETE /v1/menus/:menuId/items/:itemId (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let menuId: string;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'itemsDeleteA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);
    productId     = seedA.product.id;

    const seedB = await seedRestaurant(prisma, 'itemsDeleteB');
    adminTokenB = await login(app, seedB.admin.email);

    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Delete Items' })
      .expect(201);

    menuId = menuRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  async function addItem(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: 'Carnes' })
      .expect(201);
    return res.body.id;
  }

  it('401 — unauthenticated request is rejected', async () => {
    const itemId = await addItem();
    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}/items/${itemId}`)
      .expect(401);
  });

  it('403 — BASIC cannot delete an item', async () => {
    const itemId = await addItem();
    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(403);
  });

  it('404 — menu not found', async () => {
    const itemId = await addItem();
    await request(app.getHttpServer())
      .delete(`/v1/menus/00000000-0000-0000-0000-000000000000/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('404 — restaurant B cannot delete item from menu of restaurant A (isolation)', async () => {
    const itemId = await addItem();
    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });

  it('204 — ADMIN can delete an item and response has no body', async () => {
    const itemId = await addItem();
    const res = await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    expect(res.body).toEqual({});
  });

  it('204 — MANAGER can delete an item', async () => {
    const itemId = await addItem();
    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(204);
  });

  it('item is removed from menu after deletion', async () => {
    const itemId = await addItem();

    const before = await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const countBefore = before.body.items.length;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const after = await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(after.body.items.length).toBe(countBefore - 1);
    const deleted = after.body.items.find((i: { id: string }) => i.id === itemId);
    expect(deleted).toBeUndefined();
  });
});
