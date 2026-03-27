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
import { productConfig } from '../../src/products/product.config';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_DB = path.resolve(__dirname, 'test-products-findall.db');

async function bootstrapApp(): Promise<{ moduleFixture: TestingModule; app: INestApplication<App>; prisma: PrismaService }> {
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
  return { moduleFixture, app, prisma };
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

describe('GET /v1/products - listProducts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let moduleFixture: TestingModule;

  // Restaurant A
  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let categoryIdA: string;

  // Restaurant B
  let adminTokenB: string;
  let categoryIdB: string;

  let productA1: any;
  let productA2: any;
  let productA3: any;

  beforeAll(async () => {
    ({ moduleFixture, app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    categoryIdB = restB.category.id;
    adminTokenB = await login(app, restB.admin.email);

    // Create products for Restaurant A sequentially to ensure different created at times
    productA1 = await prisma.product.create({
      data: { name: 'Prod A1', price: 1000, categoryId: categoryIdA, restaurantId: restA.restaurant.id }
    });
    await new Promise(r => setTimeout(r, 100)); // Sleep slightly to ensure diff timestamps

    productA2 = await prisma.product.create({
      data: { name: 'Prod A2', price: 2000, categoryId: categoryIdA, restaurantId: restA.restaurant.id }
    });
    await new Promise(r => setTimeout(r, 100));

    productA3 = await prisma.product.create({
      data: { name: 'Prod A3', price: 3000, categoryId: categoryIdA, restaurantId: restA.restaurant.id }
    });
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Permite el acceso a todos los roles válidos (ADMIN, MANAGER, BASIC)', async () => {
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${adminTokenA}`).expect(200);
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${managerTokenA}`).expect(200);
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${basicTokenA}`).expect(200);
  });

  it('Respeta el límite máximo de paginación configurado', async () => {
    const config = app.get(productConfig.KEY);
    const maxLimit = config.maxPageSize;

    // Send limit higher than maxPageSize but within global DTO max (100)
    const res = await request(app.getHttpServer())
      .get(`/v1/products?limit=100`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.meta.limit).toBe(maxLimit);
    expect(res.body.data.length).toBeLessThanOrEqual(maxLimit);
  });

  it('Devuelve los productos en orden descendente (el más nuevo primero)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const items = res.body.data;
    // Expected order: A3, A2, A1
    expect(items[0].id).toBe(productA3.id);
    expect(items[1].id).toBe(productA2.id);
    expect(items[2].id).toBe(productA1.id);
  });

  it('Valida que la estructura del response coincida con ProductListSerializer (incluye categoría)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const product = res.body.data[0];

    // Check main attributes
    expect(product.id).toBeDefined();
    expect(product.name).toBeDefined();
    expect(product.price).toBeDefined();
    expect(typeof product.price).toBe('number'); // @Transform applies correctly
    expect(product.createdAt).toBeDefined();

    // Check category relation integration
    expect(product.category).toBeDefined();
    expect(product.category.name).toBeDefined();
    expect(product.category.id).toBeUndefined();

    // Check exclusions (@Exclude fields should not exist)
    expect(product.updatedAt).toBeUndefined();
    expect(product.deletedAt).toBeUndefined();
  });

  it('Devuelve resultados de la página solicitada', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/v1/products?page=1&limit=2')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get('/v1/products?page=2&limit=2')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res1.body.meta.page).toBe(1);
    expect(res2.body.meta.page).toBe(2);

    expect(res1.body.data.length).toBe(2);
    expect(res2.body.data.length).toBe(1); // Since we have 3 products

    expect(res1.body.data[0].id).not.toBe(res2.body.data[0].id);
  });

  it('No devuelve productos eliminados (deletedAt != null)', async () => {
    // Soft delete one product manually in BD
    await prisma.product.update({
      where: { id: productA2.id },
      data: { deletedAt: new Date() }
    });

    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).toContain(productA1.id);
    expect(ids).toContain(productA3.id);
    expect(ids).not.toContain(productA2.id); // Validates missing
  });

  it('Solo devuelve productos del propio restaurante (resto B devuelve 0)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
  it('Valida estrictamente las propiedades expuestas (seguridad opt-in)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const product = res.body.data[0];

    const expectedProductKeys = [
      'id', 'name', 'description', 'price', 'stock', 
      'sku', 'imageUrl', 'active', 'categoryId', 
      'restaurantId', 'createdAt', 'category'
    ].sort();

    expect(Object.keys(product).sort()).toEqual(expectedProductKeys);

    const expectedCategoryKeys = ['name'];
    expect(Object.keys(product.category).sort()).toEqual(expectedCategoryKeys);
  });
});
