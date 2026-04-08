/**
 * E2E: Categories CRUD — /v1/categories
 *
 * Cases covered:
 *  GET    /v1/categories               — list paginated, role guard, isolation
 *  POST   /v1/categories               — create, role guard, DTO validation, duplicate name
 *  GET    /v1/categories/:id/check-delete — check impact before delete
 *  PATCH  /v1/categories/:id           — update, role guard, default protection, isolation
 *  DELETE /v1/categories/:id           — delete direct, reassignment, default protection, isolation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_DB = path.resolve(__dirname, 'test-categories.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const ts = Date.now();
  const restaurant = await prisma.restaurant.create({
    data: { name: `RestCat ${suffix} ${ts}`, slug: `rest-cat-${suffix}-${ts}` },
  });

  const defaultCategory = await prisma.productCategory.create({
    data: { name: 'Sin categoría', restaurantId: restaurant.id, isDefault: true },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `admin-cat-${suffix}-${ts}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: `manager-cat-${suffix}-${ts}@test.com`,
      passwordHash,
      role: 'MANAGER',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const basic = await prisma.user.create({
    data: {
      email: `basic-cat-${suffix}-${ts}@test.com`,
      passwordHash,
      role: 'BASIC',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, defaultCategory, admin, manager, basic };
}

async function login(app: INestApplication<App>, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((r) => {
      if (r.status !== 200 && r.status !== 201)
        throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  return res.body.accessToken as string;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Restaurant A
  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let defaultCategoryIdA: string;
  let restaurantAId: string;

  // Restaurant B
  let adminTokenB: string;
  let restaurantBId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const seedA = await seedRestaurant(prisma, 'A');
    restaurantAId = seedA.restaurant.id;
    defaultCategoryIdA = seedA.defaultCategory.id;
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'B');
    restaurantBId = seedB.restaurant.id;
    adminTokenB = await login(app, seedB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  // ── GET /v1/categories ─────────────────────────────────────────────────────

  describe('GET /v1/categories', () => {
    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/v1/categories').expect(401);
    });

    it('200 — BASIC can list categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories')
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('200 — only returns categories of the authenticated restaurant', async () => {
      const resA = await request(app.getHttpServer())
        .get('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(200);

      const idsA = resA.body.data.map((c: { id: string }) => c.id);
      const idsB = resB.body.data.map((c: { id: string }) => c.id);

      idsA.forEach((id: string) => expect(idsB).not.toContain(id));
      idsB.forEach((id: string) => expect(idsA).not.toContain(id));
    });

    it('200 — pagination meta is correct', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories?page=1&limit=5')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });
  });

  // ── POST /v1/categories ────────────────────────────────────────────────────

  describe('POST /v1/categories', () => {
    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .send({ name: 'Test' })
        .expect(401);
    });

    it('403 — BASIC cannot create a category', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${basicTokenA}`)
        .send({ name: 'Test BASIC' })
        .expect(403);
    });

    it('400 — empty name is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: '' })
        .expect(400);
    });

    it('400 — name longer than 255 characters is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'A'.repeat(256) })
        .expect(400);
    });

    it('201 — ADMIN can create a category', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Bebidas' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Bebidas');
      expect(res.body.restaurantId).toBe(restaurantAId);
      expect(res.body.isDefault).toBe(false);
    });

    it('201 — MANAGER can create a category', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ name: 'Postres' })
        .expect(201);

      expect(res.body.id).toBeDefined();
    });

    it('409 — duplicate name in the same restaurant is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Duplicada' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Duplicada' })
        .expect(409);
    });

    it('201 — same name in different restaurants is allowed', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Compartida' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .send({ name: 'Compartida' })
        .expect(201);
    });
  });

  // ── GET /v1/categories/:id/check-delete ────────────────────────────────────

  describe('GET /v1/categories/:id/check-delete', () => {
    let checkCatId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Para Chequear' })
        .expect(201);
      checkCatId = res.body.id;
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .expect(401);
    });

    it('403 — BASIC cannot check delete', async () => {
      await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(403);
    });

    it('404 — category not found returns 404', async () => {
      await request(app.getHttpServer())
        .get('/v1/categories/00000000-0000-0000-0000-000000000000/check-delete')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(404);
    });

    it('404 — restaurant B cannot check category from restaurant A (isolation)', async () => {
      await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(404);
    });

    it('200 — returns correct result for category with no products', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.productsCount).toBe(0);
      expect(res.body.isDefault).toBe(false);
      expect(res.body.canDeleteDirectly).toBe(true);
    });

    it('200 — returns canDeleteDirectly=false for default category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/categories/${defaultCategoryIdA}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.isDefault).toBe(true);
      expect(res.body.canDeleteDirectly).toBe(false);
    });

    it('200 — returns correct productsCount when category has products', async () => {
      await prisma.product.create({
        data: {
          name: 'Producto Chequeo',
          price: 500n,
          restaurantId: restaurantAId,
          categoryId: checkCatId,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.productsCount).toBe(1);
      expect(res.body.canDeleteDirectly).toBe(false);

      // Move product away so delete tests work cleanly
      await prisma.product.updateMany({
        where: { categoryId: checkCatId },
        data: { categoryId: defaultCategoryIdA },
      });
    });
  });

  // ── PATCH /v1/categories/:id ───────────────────────────────────────────────

  describe('PATCH /v1/categories/:id', () => {
    let patchCatId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Para Editar' })
        .expect(201);
      patchCatId = res.body.id;
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .send({ name: 'X' })
        .expect(401);
    });

    it('403 — BASIC cannot update a category', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .send({ name: 'X' })
        .expect(403);
    });

    it('404 — category not found returns 404', async () => {
      await request(app.getHttpServer())
        .patch('/v1/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'X' })
        .expect(404);
    });

    it('404 — restaurant B cannot update category from restaurant A (isolation)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .send({ name: 'Hack' })
        .expect(404);
    });

    it('403 DEFAULT_CATEGORY_PROTECTED — cannot update the default category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/${defaultCategoryIdA}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Nuevo Nombre Default' })
        .expect(403);

      expect(res.body.code).toBe('DEFAULT_CATEGORY_PROTECTED');
    });

    it('400 — name longer than 255 characters is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'A'.repeat(256) })
        .expect(400);
    });

    it('200 — ADMIN can update a category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Nombre Actualizado' })
        .expect(200);

      expect(res.body.name).toBe('Nombre Actualizado');
    });

    it('200 — MANAGER can update a category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ name: 'Nombre Manager' })
        .expect(200);

      expect(res.body.name).toBe('Nombre Manager');
    });
  });

  // ── DELETE /v1/categories/:id ──────────────────────────────────────────────

  describe('DELETE /v1/categories/:id', () => {
    let deleteCatId: string;
    let catWithProductsId: string;
    let reassignTargetId: string;

    beforeAll(async () => {
      const resEmpty = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Para Eliminar Directo' })
        .expect(201);
      deleteCatId = resEmpty.body.id;

      const resWith = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Con Productos' })
        .expect(201);
      catWithProductsId = resWith.body.id;

      await prisma.product.create({
        data: {
          name: 'Producto para reasignar',
          price: 1000n,
          restaurantId: restaurantAId,
          categoryId: catWithProductsId,
        },
      });

      const resTarget = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Destino Reasignacion' })
        .expect(201);
      reassignTargetId = resTarget.body.id;
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .expect(401);
    });

    it('403 — BASIC cannot delete a category', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(403);
    });

    it('404 — category not found returns 404', async () => {
      await request(app.getHttpServer())
        .delete('/v1/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(404);
    });

    it('404 — restaurant B cannot delete category from restaurant A (isolation)', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(404);
    });

    it('403 DEFAULT_CATEGORY_PROTECTED — cannot delete the default category', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${defaultCategoryIdA}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(403);

      expect(res.body.code).toBe('DEFAULT_CATEGORY_PROTECTED');
    });

    it('409 CATEGORY_HAS_PRODUCTS — delete without reassignTo when products exist', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({})
        .expect(409);

      expect(res.body.code).toBe('CATEGORY_HAS_PRODUCTS');
      expect(res.body.details.productsCount).toBe(1);
    });

    it('404 — reassignTo category not found', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: '00000000-0000-0000-0000-000000000000' })
        .expect(404);

      expect(res.body.code).toBe('ENTITY_NOT_FOUND');
    });

    it('404 — reassignTo from restaurant B is rejected (cross-restaurant isolation)', async () => {
      const catB = await prisma.productCategory.findFirst({
        where: { restaurantId: restaurantBId },
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: catB!.id })
        .expect(404);

      expect(res.body.code).toBe('ENTITY_NOT_FOUND');
    });

    it('400 — reassignTo same as the category being deleted', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: catWithProductsId })
        .expect(400);
    });

    it('200 — delete with reassignTo moves products and deletes category', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: reassignTargetId })
        .expect(200);

      const gone = await prisma.productCategory.findUnique({ where: { id: catWithProductsId } });
      expect(gone).toBeNull();

      const stillInSource = await prisma.product.findMany({
        where: { categoryId: catWithProductsId },
      });
      expect(stillInSource).toHaveLength(0);

      const reassigned = await prisma.product.findMany({
        where: { categoryId: reassignTargetId },
      });
      expect(reassigned.length).toBeGreaterThan(0);
    });

    it('200 — ADMIN can delete a category with no products directly', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({})
        .expect(200);

      expect(res.body.id).toBe(deleteCatId);

      const gone = await prisma.productCategory.findUnique({ where: { id: deleteCatId } });
      expect(gone).toBeNull();
    });
  });
});
