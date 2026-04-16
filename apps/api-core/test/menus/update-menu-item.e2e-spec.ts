/**
 * E2E: PATCH /v1/menus/:menuId/items/:itemId
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot update
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot update item from menu of restaurant A
 *  - 400 empty sectionName when provided
 *  - 200 ADMIN can update item
 *  - 200 MANAGER can update item
 *  - 200 serializer shape
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menu-items-update.db');

describe('PATCH /v1/menus/:menuId/items/:itemId (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let menuId: string;
  let itemId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'itemsUpdateA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'itemsUpdateB');
    adminTokenB = await login(app, seedB.admin.email);

    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Update Items' })
      .expect(201);

    menuId = menuRes.body.id;

    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId: seedA.product.id, sectionName: 'Original', order: 1 })
      .expect(201);

    const item = await prisma.menuItem.findFirst({
      where: { menuId, productId: seedA.product.id, sectionName: 'Original' },
    });
    itemId = item!.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .send({ sectionName: 'X' })
      .expect(401);
  });

  it('403 — BASIC cannot update an item', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send({ sectionName: 'X' })
      .expect(403);
  });

  it('404 — menu not found', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/00000000-0000-0000-0000-000000000000/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ sectionName: 'X' })
      .expect(404);
  });

  it('404 — restaurant B cannot update item from menu of restaurant A (isolation)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ sectionName: 'Hack' })
      .expect(404);
  });

  it('400 — empty sectionName is rejected', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ sectionName: '' })
      .expect(400);
  });

  it('200 — ADMIN can update an item', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ sectionName: 'Carnes', order: 5 })
      .expect(200);

    expect(res.body.sectionName).toBe('Carnes');
    expect(res.body.order).toBe(5);
  });

  it('200 — MANAGER can update an item', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ sectionName: 'Pescados', order: 2 })
      .expect(200);

    expect(res.body.sectionName).toBe('Pescados');
  });

  it('200 — serializer exposes correct fields', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/menus/${menuId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ sectionName: 'Para Empezar', order: 3 })
      .expect(200);

    // item fields present
    expect(res.body.id).toBeDefined();
    expect(res.body.sectionName).toBe('Para Empezar');
    expect(typeof res.body.order).toBe('number');
    expect(res.body.product).toBeDefined();

    // item fields absent
    expect(res.body.menuId).toBeUndefined();
    expect(res.body.productId).toBeUndefined();
    expect(res.body.createdAt).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();

    // product fields present
    expect(res.body.product.id).toBeDefined();
    expect(res.body.product.name).toBeDefined();
    expect(typeof res.body.product.price).toBe('number');
    expect(typeof res.body.product.active).toBe('boolean');

    // product fields absent
    expect(res.body.product.restaurantId).toBeUndefined();
    expect(res.body.product.categoryId).toBeUndefined();
    expect(res.body.product.createdAt).toBeUndefined();
  });
});
