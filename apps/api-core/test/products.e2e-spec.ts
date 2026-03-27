/**
 * E2E: Products CRUD flow
 *
 * Tests covered:
 *  1. Bootstrap app with an isolated SQLite DB
 *  2. Create two restaurants + users (admin, manager, basic for each)
 *  3. POST /v1/products — create, role guard, DTO validations
 *  4. GET  /v1/products — paginated list (excludes soft-deleted)
 *  5. GET  /v1/products/:id — find by id
 *  6. PATCH /v1/products/:id — update
 *  7. DELETE /v1/products/:id — soft delete (sets deletedAt)
 *  8. Cross-restaurant isolation — restaurant B cannot operate on restaurant A products
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_DB = path.resolve(__dirname, 'test-products.db');

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
  const restaurant = await prisma.restaurant.create({
    data: { name: `Restaurant ${suffix}`, slug: `rest-${suffix}-${Date.now()}` },
  });

  const category = await prisma.category.create({
    data: { name: 'General', restaurantId: restaurant.id },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: `manager-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'MANAGER',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const basic = await prisma.user.create({
    data: {
      email: `basic-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'BASIC',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, category, admin, manager, basic };
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

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Restaurant A
  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let categoryIdA: string;

  // Restaurant B
  let adminTokenB: string;
  let categoryIdB: string;

  let createdProductId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    categoryIdB = restB.category.id;
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  // ── POST /v1/products ──────────────────────────────────────────────────────

  describe('POST /v1/products', () => {
    const validPayload = (catId: string) => ({
      name: 'Hamburguesa Clásica',
      description: 'Con lechuga y tomate',
      price: 1250,
      stock: 50,
      sku: 'HAM-001',
      categoryId: catId,
    });

    it('ADMIN puede crear un producto', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send(validPayload(categoryIdA))
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Hamburguesa Clásica');
      
      // Verify serialization (@Transform applies to price)
      expect(res.body.price).toBe(12.5); // serialized: 1250 cents / 100
      
      // Verify serialization (@Exclude applies to certain fields)
      expect(res.body.updatedAt).toBeUndefined();
      expect(res.body.deletedAt).toBeUndefined();
      
      createdProductId = res.body.id;
    });

    it('MANAGER puede crear un producto', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ ...validPayload(categoryIdA), name: 'Producto Manager', sku: 'MAN-001' })
        .expect(201);

      expect(res.body.id).toBeDefined();
    });

    it('BASIC recibe 403', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${basicTokenA}`)
        .send(validPayload(categoryIdA))
        .expect(403);
    });

    it('Sin token recibe 401 (restaurantId no disponible sin JWT)', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .send(validPayload(categoryIdA))
        .expect(401);
    });

    it('Rechaza precio negativo', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), price: -100 })
        .expect(400);
    });

    it('Rechaza precio decimal (no entero)', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), price: 12.5 })
        .expect(400);
    });

    it('Rechaza stock negativo', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), stock: -1 })
        .expect(400);
    });

    it('Rechaza stock > 9999', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), stock: 10000 })
        .expect(400);
    });

    it('Rechaza description > 500 chars', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), description: 'x'.repeat(501) })
        .expect(400);
    });

    it('Rechaza name vacío', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), name: '' })
        .expect(400);
    });

    it('Rechaza sku > 50 chars', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), sku: 'A'.repeat(51) })
        .expect(400);
    });

    it('Acepta precio 0 (producto gratis)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdA), price: 0, name: 'Producto Gratis', sku: 'FREE-001' })
        .expect(201);

      expect(res.body.price).toBe(0);
    });

    it('No puede crear producto con categoryId de otro restaurante', async () => {
      // categoryIdB pertenece al restaurante B, adminTokenA es del restaurante A
      // El producto debe fallar porque la categoría no pertenece a su restaurante
      const res = await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ ...validPayload(categoryIdB), name: 'Producto Cruzado', sku: 'CROSS-001' })
        .expect(404);

      expect(res.body.code).toBe('ENTITY_NOT_FOUND');
      expect(res.body.message).toBe('Category not found');
      expect(res.body.details?.entity).toBe('Category');
    });
  });

  // ── GET /v1/products ───────────────────────────────────────────────────────

  describe('GET /v1/products', () => {
    it('Devuelve lista paginada con precios serializados', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThan(0);
      // All prices should be numbers, not bigints (JSON serialized)
      res.body.data.forEach((p: { price: unknown }) => {
        expect(typeof p.price).toBe('number');
      });
    });

    it('Solo devuelve productos del propio restaurante', async () => {
      const resA = await request(app.getHttpServer())
        .get('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/v1/products')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(200);

      const idsA = resA.body.data.map((p: { id: string }) => p.id);
      const idsB = resB.body.data.map((p: { id: string }) => p.id);

      // No product from A should appear in B and vice versa
      idsA.forEach((id: string) => expect(idsB).not.toContain(id));
      idsB.forEach((id: string) => expect(idsA).not.toContain(id));
    });

    it('Sin token recibe 401', async () => {
      await request(app.getHttpServer()).get('/v1/products').expect(401);
    });
  });

  // ── GET /v1/products/:id ───────────────────────────────────────────────────

  describe('GET /v1/products/:id', () => {
    it('Devuelve producto por ID con precio serializado', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.id).toBe(createdProductId);
      expect(typeof res.body.price).toBe('number');
    });

    it('Devuelve 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/v1/products/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(404);
    });

    it('Restaurante B no puede ver producto de restaurante A (aislamiento)', async () => {
      // createdProductId belongs to restaurant A; adminTokenB is from restaurant B
      await request(app.getHttpServer())
        .get(`/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(404);
    });
  });

  // ── PATCH /v1/products/:id ─────────────────────────────────────────────────

  describe('PATCH /v1/products/:id', () => {
    it('ADMIN puede actualizar nombre', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Hamburguesa Actualizada' })
        .expect(200);

      expect(res.body.name).toBe('Hamburguesa Actualizada');
    });

    it('BASIC recibe 403', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .send({ name: 'Intento BASIC' })
        .expect(403);
    });

    it('Devuelve 404 si producto no existe', async () => {
      await request(app.getHttpServer())
        .patch('/v1/products/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'No importa' })
        .expect(404);
    });

    it('Restaurante B no puede actualizar producto de restaurante A (aislamiento)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .send({ name: 'Hack intento' })
        .expect(404);
    });
  });

  // ── DELETE /v1/products/:id (soft delete) ─────────────────────────────────

  describe('DELETE /v1/products/:id', () => {
    let softDeletedId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({
          name: 'Producto Para Eliminar',
          price: 500,
          categoryId: categoryIdA,
        })
        .expect(201);
      softDeletedId = res.body.id;
    });

    it('Restaurante B no puede eliminar producto de restaurante A (aislamiento)', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/products/${softDeletedId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(404);
    });

    it('Soft delete setea deletedAt en la BD', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/products/${softDeletedId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      const product = await prisma.product.findUnique({ where: { id: softDeletedId } });
      expect(product).not.toBeNull();
      expect(product!.deletedAt).not.toBeNull();
    });

    it('Producto soft-deleted no aparece en el listado', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/products')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(softDeletedId);
    });

    it('Producto soft-deleted devuelve 404 en GET :id', async () => {
      await request(app.getHttpServer())
        .get(`/v1/products/${softDeletedId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(404);
    });

    it('BASIC recibe 403 al intentar eliminar', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/products/${createdProductId}`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(403);
    });
  });
});
