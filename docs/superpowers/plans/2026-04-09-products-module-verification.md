# Products Module Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verificar y completar el módulo de productos: fix DELETE→204, crear helper compartido para tests e2e, separar un archivo e2e por endpoint, y documentar el módulo en `.module.info.md`.

**Architecture:** Un helper compartido (`test/products/products.helpers.ts`) exporta `bootstrapApp`, `seedRestaurant` y `login`. Cada suite e2e crea su propia DB SQLite aislada e importa los helpers. El controller se corrige para retornar 204 en DELETE. El `.module.info.md` documenta el estado final del módulo.

**Tech Stack:** NestJS, Prisma (SQLite para tests), Jest + Supertest, class-transformer.

---

## File Map

| Acción | Archivo |
|---|---|
| MODIFY | `apps/api-core/src/products/products.controller.ts` |
| CREATE | `test/products/products.helpers.ts` |
| MODIFY | `test/products/listProducts.e2e-spec.ts` |
| CREATE | `test/products/findOneProduct.e2e-spec.ts` |
| CREATE | `test/products/createProduct.e2e-spec.ts` |
| CREATE | `test/products/updateProduct.e2e-spec.ts` |
| CREATE | `test/products/deleteProduct.e2e-spec.ts` |
| DELETE | `test/products/createProducts.e2e-spec.ts` |
| CREATE | `apps/api-core/src/products/product.module.info.md` |

---

## Task 1: Fix DELETE → 204 No Content

**Files:**
- Modify: `apps/api-core/src/products/products.controller.ts`

- [ ] **Step 1: Agregar `@HttpCode(HttpStatus.NO_CONTENT)` y eliminar el return body**

En `apps/api-core/src/products/products.controller.ts`, reemplazar el método `remove`:

```typescript
// Antes:
@Delete(':id')
@Roles(Role.ADMIN, Role.MANAGER)
async remove(
  @Param('id') id: string,
  @CurrentUser() user: { restaurantId: string },
) {
  const product = await this.productsService.deleteProduct(id, user.restaurantId);
  return new ProductSerializer(product);
}

// Después:
@Delete(':id')
@Roles(Role.ADMIN, Role.MANAGER)
@HttpCode(HttpStatus.NO_CONTENT)
@ApiOperation({ summary: 'Desactivar producto (soft delete)' })
@ApiParam({ name: 'id', description: 'ID del producto', type: String })
@ApiResponse({ status: 204, description: 'Producto desactivado' })
@ApiResponse({ status: 404, description: 'Producto no encontrado' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
async remove(
  @Param('id') id: string,
  @CurrentUser() user: { restaurantId: string },
): Promise<void> {
  await this.productsService.deleteProduct(id, user.restaurantId);
}
```

Agregar `HttpStatus` al import de `@nestjs/common` (ya está `HttpCode`, solo agregar `HttpStatus`):
```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, ClassSerializerInterceptor,
  HttpCode, HttpStatus,
} from '@nestjs/common';
```

Remover `ProductSerializer` del import si queda sin usar en este método (verificar que aún se usa en `findOne`, `create`, `update`).

- [ ] **Step 2: Commit**

```bash
cd apps/api-core
git add src/products/products.controller.ts
git commit -m "fix(products): DELETE returns 204 No Content without body"
```

---

## Task 2: Crear helper compartido de tests e2e

**Files:**
- Create: `test/products/products.helpers.ts`

- [ ] **Step 1: Crear el archivo de helpers**

Crear `apps/api-core/test/products/products.helpers.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function bootstrapApp(dbPath: string): Promise<{
  moduleFixture: TestingModule;
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  process.env.DATABASE_URL = `file:${dbPath}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { moduleFixture, app, prisma };
}

export async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Restaurant ${suffix} ${Date.now()}`,
      slug: `rest-${suffix}-${Date.now()}`,
    },
  });

  const category = await prisma.productCategory.create({
    data: { name: 'General', restaurantId: restaurant.id, isDefault: false },
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

export async function login(
  app: INestApplication<App>,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((r) => {
      if (r.status !== 200 && r.status !== 201)
        throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  return res.body.accessToken as string;
}
```

- [ ] **Step 2: Commit**

```bash
cd apps/api-core
git add test/products/products.helpers.ts
git commit -m "test(products): add shared e2e helpers (bootstrapApp, seedRestaurant, login)"
```

---

## Task 3: Actualizar `listProducts.e2e-spec.ts`

**Files:**
- Modify: `test/products/listProducts.e2e-spec.ts`

Refactorizar para usar los helpers compartidos y agregar el test de 401.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

Reemplazar `apps/api-core/test/products/listProducts.e2e-spec.ts` con:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../src/prisma/prisma.service';
import { productConfig } from '../../src/products/product.config';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-list-products.db');

describe('GET /v1/products - listProducts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let moduleFixture: TestingModule;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let categoryIdA: string;
  let adminTokenB: string;

  let productA1: any;
  let productA2: any;
  let productA3: any;

  beforeAll(async () => {
    ({ moduleFixture, app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);

    productA1 = await prisma.product.create({
      data: { name: 'Prod A1', price: 1000n, categoryId: categoryIdA, restaurantId: restA.restaurant.id },
    });
    await new Promise((r) => setTimeout(r, 50));

    productA2 = await prisma.product.create({
      data: { name: 'Prod A2', price: 2000n, categoryId: categoryIdA, restaurantId: restA.restaurant.id },
    });
    await new Promise((r) => setTimeout(r, 50));

    productA3 = await prisma.product.create({
      data: { name: 'Prod A3', price: 3000n, categoryId: categoryIdA, restaurantId: restA.restaurant.id },
    });
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/products').expect(401);
  });

  it('Permite el acceso a ADMIN, MANAGER y BASIC', async () => {
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${adminTokenA}`).expect(200);
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${managerTokenA}`).expect(200);
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${basicTokenA}`).expect(200);
  });

  it('Respeta el límite máximo de paginación configurado', async () => {
    const config = app.get(productConfig.KEY);
    const maxLimit = config.maxPageSize;

    const res = await request(app.getHttpServer())
      .get('/v1/products?limit=100')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.meta.limit).toBe(maxLimit);
    expect(res.body.data.length).toBeLessThanOrEqual(maxLimit);
  });

  it('Devuelve los productos en orden descendente (más nuevo primero)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const items = res.body.data;
    expect(items[0].id).toBe(productA3.id);
    expect(items[1].id).toBe(productA2.id);
    expect(items[2].id).toBe(productA1.id);
  });

  it('Estructura ProductListSerializer: price como number, category.name, sin updatedAt/deletedAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const product = res.body.data[0];

    expect(product.id).toBeDefined();
    expect(product.name).toBeDefined();
    expect(typeof product.price).toBe('number');
    expect(product.category).toBeDefined();
    expect(product.category.name).toBeDefined();
    expect(product.category.id).toBeUndefined();
    expect(product.updatedAt).toBeUndefined();
    expect(product.deletedAt).toBeUndefined();
  });

  it('Valida estrictamente las propiedades expuestas (opt-in)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const product = res.body.data[0];
    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt', 'category',
    ].sort();

    expect(Object.keys(product).sort()).toEqual(expectedKeys);
    expect(Object.keys(product.category).sort()).toEqual(['name']);
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
    expect(res2.body.data.length).toBe(1);
    expect(res1.body.data[0].id).not.toBe(res2.body.data[0].id);
  });

  it('No devuelve productos con soft delete (deletedAt != null)', async () => {
    await prisma.product.update({
      where: { id: productA2.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).toContain(productA1.id);
    expect(ids).toContain(productA3.id);
    expect(ids).not.toContain(productA2.id);
  });

  it('Solo devuelve productos del propio restaurante', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que pasa**

```bash
cd apps/api-core
npm run test:e2e -- --testPathPattern="listProducts" --forceExit
```

Esperado: todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add test/products/listProducts.e2e-spec.ts
git commit -m "test(products): refactor listProducts e2e to use shared helpers, add 401 test"
```

---

## Task 4: Crear `findOneProduct.e2e-spec.ts`

**Files:**
- Create: `test/products/findOneProduct.e2e-spec.ts`

- [ ] **Step 1: Crear el archivo**

Crear `apps/api-core/test/products/findOneProduct.e2e-spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-findone-product.db');

describe('GET /v1/products/:id - findOneProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;

  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);

    const product = await prisma.product.create({
      data: {
        name: 'Producto Test',
        price: 1500n,
        categoryId: restA.category.id,
        restaurantId: restA.restaurant.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .expect(401);
  });

  it('ADMIN puede obtener un producto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
  });

  it('MANAGER puede obtener un producto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
  });

  it('BASIC puede obtener un producto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
  });

  it('Estructura ProductSerializer: price como number, sin category, sin updatedAt/deletedAt', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
    expect(typeof res.body.price).toBe('number');
    expect(res.body.category).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
  });

  it('Valida estrictamente las propiedades expuestas (opt-in)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt',
    ].sort();

    expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
  });

  it('Devuelve price como number serializado desde centavos (1500 centavos → 15)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.price).toBe(15);
  });

  it('Producto no existe → 404', async () => {
    await request(app.getHttpServer())
      .get('/v1/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('Producto de otro restaurante → 404 (aislamiento)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Ejecutar el test**

```bash
cd apps/api-core
npm run test:e2e -- --testPathPattern="findOneProduct" --forceExit
```

Esperado: todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add test/products/findOneProduct.e2e-spec.ts
git commit -m "test(products): add findOneProduct e2e suite"
```

---

## Task 5: Crear `createProduct.e2e-spec.ts`

**Files:**
- Create: `test/products/createProduct.e2e-spec.ts`

- [ ] **Step 1: Crear el archivo**

Crear `apps/api-core/test/products/createProduct.e2e-spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-create-product.db');

describe('POST /v1/products - createProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let categoryIdA: string;
  let categoryIdB: string;

  const validPayload = (catId: string) => ({
    name: 'Hamburguesa Clásica',
    description: 'Con lechuga y tomate',
    price: 1250,
    stock: 50,
    sku: 'HAM-001',
    categoryId: catId,
  });

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    categoryIdB = restB.category.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .send(validPayload(categoryIdA))
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send(validPayload(categoryIdA))
      .expect(403);
  });

  it('ADMIN puede crear un producto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), name: 'Producto Admin', sku: 'ADM-001' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Producto Admin');
  });

  it('MANAGER puede crear un producto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ ...validPayload(categoryIdA), name: 'Producto Manager', sku: 'MGR-001' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Producto Manager');
  });

  it('Transformación centavos: price=1250 en request → 12.5 en response', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: 1250, name: 'Test Centavos', sku: 'CENTS-001' })
      .expect(201);

    expect(res.body.price).toBe(12.5);
    expect(typeof res.body.price).toBe('number');
  });

  it('price=0 es válido (producto gratis)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: 0, name: 'Producto Gratis', sku: 'FREE-001' })
      .expect(201);

    expect(res.body.price).toBe(0);
  });

  it('Estructura ProductSerializer (campos exactos, sin updatedAt/deletedAt)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), name: 'Test Serializer', sku: 'SER-001' })
      .expect(201);

    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt',
    ].sort();

    expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
  });

  it('name vacío → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), name: '' })
      .expect(400);
  });

  it('price negativo → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: -100 })
      .expect(400);
  });

  it('price decimal (no entero) → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: 12.5 })
      .expect(400);
  });

  it('stock negativo → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), stock: -1 })
      .expect(400);
  });

  it('stock > 9999 → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), stock: 10000 })
      .expect(400);
  });

  it('description > 500 chars → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), description: 'x'.repeat(501) })
      .expect(400);
  });

  it('sku > 50 chars → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), sku: 'A'.repeat(51) })
      .expect(400);
  });

  it('categoryId de otro restaurante → 404 (aislamiento)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdB), name: 'Cross Restaurant', sku: 'CROSS-001' })
      .expect(404);

    expect(res.body.code).toBe('ENTITY_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Ejecutar el test**

```bash
cd apps/api-core
npm run test:e2e -- --testPathPattern="createProduct" --forceExit
```

Esperado: todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add test/products/createProduct.e2e-spec.ts
git commit -m "test(products): add createProduct e2e suite with cents transformation validation"
```

---

## Task 6: Crear `updateProduct.e2e-spec.ts`

**Files:**
- Create: `test/products/updateProduct.e2e-spec.ts`

- [ ] **Step 1: Crear el archivo**

Crear `apps/api-core/test/products/updateProduct.e2e-spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-update-product.db');

describe('PATCH /v1/products/:id - updateProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let categoryIdA: string;
  let categoryIdB: string;

  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    categoryIdB = restB.category.id;
    adminTokenB = await login(app, restB.admin.email);

    const product = await prisma.product.create({
      data: {
        name: 'Producto Original',
        price: 1000n,
        categoryId: categoryIdA,
        restaurantId: restA.restaurant.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .send({ name: 'Nuevo Nombre' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send({ name: 'Intento BASIC' })
      .expect(403);
  });

  it('ADMIN puede actualizar nombre', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Nombre Actualizado Admin' })
      .expect(200);

    expect(res.body.name).toBe('Nombre Actualizado Admin');
  });

  it('MANAGER puede actualizar precio', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ price: 2000 })
      .expect(200);

    // 2000 centavos → $20.00 serializado
    expect(res.body.price).toBe(20);
  });

  it('Transformación centavos al actualizar precio: 500 → 5', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ price: 500 })
      .expect(200);

    expect(res.body.price).toBe(5);
    expect(typeof res.body.price).toBe('number');
  });

  it('Respuesta es ProductSerializer (campos exactos, sin updatedAt/deletedAt)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Test Serializer Update' })
      .expect(200);

    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt',
    ].sort();

    expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
  });

  it('Producto no existe → 404', async () => {
    await request(app.getHttpServer())
      .patch('/v1/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'No importa' })
      .expect(404);
  });

  it('Producto de otro restaurante → 404 (aislamiento)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ name: 'Hack intento' })
      .expect(404);
  });

  it('categoryId de otro restaurante → 404 (aislamiento)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ categoryId: categoryIdB })
      .expect(404);

    expect(res.body.code).toBe('ENTITY_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Ejecutar el test**

```bash
cd apps/api-core
npm run test:e2e -- --testPathPattern="updateProduct" --forceExit
```

Esperado: todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add test/products/updateProduct.e2e-spec.ts
git commit -m "test(products): add updateProduct e2e suite"
```

---

## Task 7: Crear `deleteProduct.e2e-spec.ts`

**Files:**
- Create: `test/products/deleteProduct.e2e-spec.ts`

- [ ] **Step 1: Crear el archivo**

Crear `apps/api-core/test/products/deleteProduct.e2e-spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-delete-product.db');

describe('DELETE /v1/products/:id - deleteProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let categoryIdA: string;
  let restaurantIdA: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    restaurantIdA = restA.restaurant.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  async function createProduct(name: string): Promise<string> {
    const product = await prisma.product.create({
      data: { name, price: 1000n, categoryId: categoryIdA, restaurantId: restaurantIdA },
    });
    return product.id;
  }

  it('Sin token recibe 401', async () => {
    const id = await createProduct('Producto 401');
    await request(app.getHttpServer()).delete(`/v1/products/${id}`).expect(401);
  });

  it('BASIC recibe 403', async () => {
    const id = await createProduct('Producto BASIC');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(403);
  });

  it('ADMIN elimina (soft delete) → 204 sin body', async () => {
    const id = await createProduct('Producto Admin Delete');
    const res = await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    expect(res.body).toEqual({});
    expect(res.text).toBe('');
  });

  it('MANAGER elimina (soft delete) → 204 sin body', async () => {
    const id = await createProduct('Producto Manager Delete');
    const res = await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(204);

    expect(res.body).toEqual({});
    expect(res.text).toBe('');
  });

  it('Soft delete setea deletedAt en BD', async () => {
    const id = await createProduct('Producto Con DeletedAt');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const product = await prisma.product.findUnique({ where: { id } });
    expect(product).not.toBeNull();
    expect(product!.deletedAt).not.toBeNull();
  });

  it('Producto soft-deleted no aparece en listado', async () => {
    const id = await createProduct('Producto Para Listar');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).not.toContain(id);
  });

  it('Producto soft-deleted devuelve 404 en GET /:id', async () => {
    const id = await createProduct('Producto Para GET 404');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('Producto no existe → 404', async () => {
    await request(app.getHttpServer())
      .delete('/v1/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('Producto de otro restaurante → 404 (aislamiento)', async () => {
    const id = await createProduct('Producto Aislamiento');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Ejecutar el test**

```bash
cd apps/api-core
npm run test:e2e -- --testPathPattern="deleteProduct" --forceExit
```

Esperado: todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add test/products/deleteProduct.e2e-spec.ts
git commit -m "test(products): add deleteProduct e2e suite (expects 204 No Content)"
```

---

## Task 8: Eliminar `createProducts.e2e-spec.ts`

**Files:**
- Delete: `test/products/createProducts.e2e-spec.ts`

- [ ] **Step 1: Eliminar el archivo monolítico**

```bash
cd apps/api-core
rm test/products/createProducts.e2e-spec.ts
```

- [ ] **Step 2: Verificar que los tests restantes pasan**

```bash
npm run test:e2e -- --testPathPattern="products" --forceExit
```

Esperado: los 5 archivos corren, todos en verde.

- [ ] **Step 3: Commit**

```bash
git add -u test/products/createProducts.e2e-spec.ts
git commit -m "test(products): remove monolithic createProducts e2e (replaced by per-endpoint suites)"
```

---

## Task 9: Crear `product.module.info.md`

**Files:**
- Create: `apps/api-core/src/products/product.module.info.md`

- [ ] **Step 1: Crear el archivo de documentación**

Crear `apps/api-core/src/products/product.module.info.md`:

```markdown
### Product (products)

### Respuesta serializada

**ProductSerializer** — usado en GET /:id, POST, PATCH:
\```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "price": 12.5,
  "stock": 50,
  "sku": "string | null",
  "imageUrl": "string | null",
  "active": true,
  "categoryId": "string",
  "restaurantId": "string",
  "createdAt": "ISO8601"
}
\```

**ProductListSerializer** — usado en GET list (igual + `category`):
\```json
{
  "...campos de ProductSerializer",
  "category": { "name": "string" }
}
\```

Los campos `updatedAt` y `deletedAt` **no se exponen**. El DELETE no retorna body.

### Endpoints

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/products` | ADMIN, MANAGER, BASIC | `PaginatedProductsSerializer` | Lista paginada |
| `GET` | `/v1/products/:id` | ADMIN, MANAGER, BASIC | `ProductSerializer` | Obtener por ID |
| `POST` | `/v1/products` | ADMIN, MANAGER | `ProductSerializer` | Crear producto |
| `PATCH` | `/v1/products/:id` | ADMIN, MANAGER | `ProductSerializer` | Actualizar producto |
| `DELETE` | `/v1/products/:id` | ADMIN, MANAGER | `204 No Content` | Soft delete |

---

#### List — `GET /v1/products`

E2E: ✅ `test/products/listProducts.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede listar | 200 | Retorna `{ data, meta }` paginado |
| MANAGER puede listar | 200 | Retorna `{ data, meta }` paginado |
| BASIC puede listar | 200 | Retorna `{ data, meta }` paginado |
| Estructura `ProductListSerializer` | 200 | price como number, category.name, sin updatedAt/deletedAt |
| Con `?page=1&limit=2` | 200 | Meta correcta |
| Soft-deleted no aparecen | 200 | Filtra `deletedAt = null` |
| Solo productos del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |

---

#### Find One — `GET /v1/products/:id`

E2E: ✅ `test/products/findOneProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede obtener | 200 | Retorna `ProductSerializer` |
| MANAGER puede obtener | 200 | Retorna `ProductSerializer` |
| BASIC puede obtener | 200 | Retorna `ProductSerializer` |
| Estructura `ProductSerializer` | 200 | price como number, sin category, sin updatedAt/deletedAt |
| Producto no existe | 404 | `ENTITY_NOT_FOUND` |
| Producto de otro restaurante | 404 | Aislamiento — `findById(id, restaurantId)` retorna null |

---

#### Create — `POST /v1/products`

E2E: ✅ `test/products/createProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta crear | 403 | Solo ADMIN o MANAGER |
| ADMIN crea producto válido | 201 | Retorna `ProductSerializer` |
| MANAGER crea producto válido | 201 | Retorna `ProductSerializer` |
| Transformación centavos | 201 | price=1250 (request) → 12.5 (response) |
| `name` vacío | 400 | `@IsNotEmpty()` en DTO |
| `price` negativo | 400 | `@MinBigInt(0n)` en DTO |
| `price` decimal (no entero) | 400 | `@IsBigInt()` — `toCents()` rechaza floats |
| `stock` negativo | 400 | `@Min(0)` en DTO |
| `stock` > 9999 | 400 | `@Max(9999)` en DTO |
| `description` > 500 chars | 400 | `@MaxLength(500)` en DTO |
| `sku` > 50 chars | 400 | `@MaxLength(50)` en DTO |
| `categoryId` de otro restaurante | 404 | `ENTITY_NOT_FOUND` — validado antes de crear |
| `price` = 0 (producto gratis) | 201 | Permitido |

---

#### Update — `PATCH /v1/products/:id`

E2E: ✅ `test/products/updateProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| ADMIN actualiza nombre | 200 | Retorna `ProductSerializer` |
| MANAGER actualiza precio | 200 | Retorna `ProductSerializer` |
| Transformación centavos al actualizar precio | 200 | Mismo mecanismo que en create |
| Producto no existe | 404 | `ENTITY_NOT_FOUND` |
| Producto de otro restaurante | 404 | Aislamiento |
| `categoryId` de otro restaurante | 404 | `ENTITY_NOT_FOUND` |

---

#### Delete — `DELETE /v1/products/:id`

**Sin body en respuesta.**

E2E: ✅ `test/products/deleteProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta eliminar | 403 | Solo ADMIN o MANAGER |
| ADMIN elimina | 204 | Soft delete — setea `deletedAt` |
| MANAGER elimina | 204 | Soft delete — setea `deletedAt` |
| Producto no existe | 404 | `ENTITY_NOT_FOUND` |
| Producto de otro restaurante | 404 | Aislamiento |

---

### Notas de implementación

- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `price` se recibe en centavos enteros (ej: 1250 = $12.50). El DTO transforma con `toCents()` → `BigInt`. El serializer convierte con `fromCents()` → `number` para la API (JSON no soporta `BigInt` nativo)
- Soft delete: `deletedAt` se setea en la BD. El producto desaparece de `findAll` y de `findById`. El `DELETE` retorna 204 sin body
- `categoryId` al crear/actualizar se valida que pertenezca al mismo restaurante mediante `findCategoryAndThrowIfNotFound`
- El listado incluye `category: { name }` via `include` en el repositorio (`findByRestaurantIdPaginated` usa `include: { category: { select: { name: true } } }`)
- Orden de listado: `orderBy: { createdAt: 'desc' }` — producto más nuevo primero

### Serializers

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `ProductSerializer` | `id`, `name`, `description`, `price` (number), `stock`, `sku`, `imageUrl`, `active`, `categoryId`, `restaurantId`, `createdAt` | GET :id, POST, PATCH |
| `ProductListSerializer` | Igual que `ProductSerializer` + `category: { name }` | GET list |
| `PaginatedProductsSerializer` | `data: ProductListSerializer[]`, `meta` | GET list |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit (service) | `src/products/products.service.spec.ts` | ✅ |
| E2E | `test/products/listProducts.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/products/findOneProduct.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/products/createProduct.e2e-spec.ts` | ✅ 14 tests |
| E2E | `test/products/updateProduct.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/products/deleteProduct.e2e-spec.ts` | ✅ 8 tests |
```

- [ ] **Step 2: Commit**

```bash
cd apps/api-core
git add src/products/product.module.info.md
git commit -m "docs(products): add product.module.info.md with full endpoint coverage"
```
