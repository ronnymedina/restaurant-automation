/**
 * E2E: POST /v1/menus/:menuId/items
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot add item
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot add items to menu from restaurant A
 *  - 400 empty sectionName when provided
 *  - 201 ADMIN can add item
 *  - 201 MANAGER can add item
 *  - 201 order auto-increments within section
 *  - 201 serializer shape (fields present and absent)
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menu-items-create.db');

describe('POST /v1/menus/:menuId/items (e2e)', () => {
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

    const seedA = await seedRestaurant(prisma, 'itemsCreateA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);
    productId     = seedA.product.id;

    const seedB = await seedRestaurant(prisma, 'itemsCreateB');
    adminTokenB = await login(app, seedB.admin.email);

    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Carta Items' })
      .expect(201);

    menuId = menuRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .send({ productId })
      .expect(401);
  });

  it('403 — BASIC cannot add an item', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send({ productId })
      .expect(403);
  });

  it('404 — menu not found', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus/00000000-0000-0000-0000-000000000000/items')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId })
      .expect(404);
  });

  it('404 — restaurant B cannot add item to menu from restaurant A (isolation)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ productId })
      .expect(404);
  });

  it('400 — empty sectionName is rejected', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: '' })
      .expect(400);
  });

  it('400 — invalid productId is rejected', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId: 'not-a-uuid' })
      .expect(400);
  });

  it('201 — ADMIN can add an item', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: 'Carnes', order: 1 })
      .expect(201);

    expect(res.body.menuId).toBeDefined();
    expect(res.body.productId).toBeDefined();
    expect(res.body.sectionName).toBe('Carnes');
    expect(res.body.order).toBe(1);
  });

  it('201 — MANAGER can add an item', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ productId, sectionName: 'Bebidas' })
      .expect(201);

    expect(res.body.menuId).toBeDefined();
    expect(res.body.productId).toBeDefined();
  });

  it('201 — serializer exposes correct item fields', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: 'Postres', order: 1 })
      .expect(201);

    // present
    expect(res.body.menuId).toBe(menuId);
    expect(res.body.productId).toBe(productId);
    expect(res.body.sectionName).toBe('Postres');
    expect(typeof res.body.order).toBe('number');

    // absent
    expect(res.body.id).toBeUndefined();
    expect(res.body.product).toBeUndefined();
    expect(res.body.createdAt).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
  });

  it('201 — order auto-increments within same section', async () => {
    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu Auto Order' })
      .expect(201);

    const autoMenuId = menuRes.body.id;

    const first = await request(app.getHttpServer())
      .post(`/v1/menus/${autoMenuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: 'Entradas' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/v1/menus/${autoMenuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: 'Entradas' })
      .expect(201);

    expect(second.body.order).toBeGreaterThan(first.body.order);
  });

  it('201 — item without sectionName is allowed (null)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId })
      .expect(201);

    expect(res.body.sectionName).toBeNull();
  });
});
