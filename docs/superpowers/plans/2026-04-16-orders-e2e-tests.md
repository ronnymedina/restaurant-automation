# Orders / CashRegister / Kiosk — E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write one E2E test file per exposed URL across the Orders, CashRegister, and Kiosk controllers, plus a `*.module.info.md` for each module.

**Architecture:** Follows the exact pattern of `test/products/` — each file has its own SQLite DB, `bootstrapApp`, isolated seed, and `afterAll` cleanup. Helpers are self-contained per module (no cross-module imports). Module info files mirror `product.module.info.md`.

**Tech Stack:** NestJS `@nestjs/testing`, `supertest`, `jest`, SQLite (`prisma db push`), `bcryptjs`

---

## File Map

**New files (helpers):**
- `test/orders/orders.helpers.ts`
- `test/cash-register/cash-register.helpers.ts`
- `test/kiosk/kiosk.helpers.ts`

**New files (orders tests — 6):**
- `test/orders/listOrders.e2e-spec.ts`
- `test/orders/orderHistory.e2e-spec.ts`
- `test/orders/findOneOrder.e2e-spec.ts`
- `test/orders/updateOrderStatus.e2e-spec.ts`
- `test/orders/markOrderAsPaid.e2e-spec.ts`
- `test/orders/cancelOrder.e2e-spec.ts`

**New files (cash-register tests — 5):**
- `test/cash-register/openSession.e2e-spec.ts`
- `test/cash-register/closeSession.e2e-spec.ts`
- `test/cash-register/currentSession.e2e-spec.ts`
- `test/cash-register/sessionHistory.e2e-spec.ts`
- `test/cash-register/sessionSummary.e2e-spec.ts`

**New files (kiosk tests — 5):**
- `test/kiosk/kioskStatus.e2e-spec.ts`
- `test/kiosk/kioskMenus.e2e-spec.ts`
- `test/kiosk/kioskMenuItems.e2e-spec.ts`
- `test/kiosk/kioskCreateOrder.e2e-spec.ts`
- `test/kiosk/kioskOrderStatus.e2e-spec.ts`

**New files (module info — 3):**
- `apps/api-core/src/orders/orders.module.info.md`
- `apps/api-core/src/cash-register/cash-register.module.info.md`
- `apps/api-core/src/kiosk/kiosk.module.info.md`

---

## Task 1: orders.helpers.ts

**Files:**
- Create: `test/orders/orders.helpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
// test/orders/orders.helpers.ts
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

export async function seedProduct(
  prisma: PrismaService,
  restaurantId: string,
  categoryId: string,
  overrides: { name?: string; price?: bigint; stock?: number | null } = {},
) {
  return prisma.product.create({
    data: {
      name: overrides.name ?? `Producto ${Date.now()}`,
      price: overrides.price ?? BigInt(1000), // 1000 cents = $10
      stock: overrides.stock !== undefined ? overrides.stock : 10,
      restaurantId,
      categoryId,
    },
  });
}

export async function openCashShift(
  prisma: PrismaService,
  restaurantId: string,
  userId: string,
) {
  return prisma.cashShift.create({
    data: { restaurantId, userId },
  });
}

export async function seedOrder(
  prisma: PrismaService,
  restaurantId: string,
  cashShiftId: string,
  productId: string,
  overrides: { status?: string; isPaid?: boolean } = {},
) {
  const updatedShift = await prisma.cashShift.update({
    where: { id: cashShiftId },
    data: { lastOrderNumber: { increment: 1 } },
  });

  return prisma.order.create({
    data: {
      orderNumber: updatedShift.lastOrderNumber,
      restaurantId,
      cashShiftId,
      totalAmount: BigInt(1000),
      status: (overrides.status as any) ?? 'CREATED',
      isPaid: overrides.isPaid ?? false,
      items: {
        create: [{ productId, quantity: 1, unitPrice: BigInt(1000), subtotal: BigInt(1000) }],
      },
    },
    include: { items: true },
  });
}
```

- [ ] **Step 2: Commit helpers**

```bash
cd apps/api-core
git add test/orders/orders.helpers.ts
git commit -m "test(orders): add orders e2e helpers"
```

---

## Task 2: cash-register.helpers.ts

**Files:**
- Create: `test/cash-register/cash-register.helpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
// test/cash-register/cash-register.helpers.ts
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

export async function seedProduct(
  prisma: PrismaService,
  restaurantId: string,
  categoryId: string,
) {
  return prisma.product.create({
    data: {
      name: `Producto ${Date.now()}`,
      price: BigInt(1000),
      stock: 10,
      restaurantId,
      categoryId,
    },
  });
}

export async function openCashShiftViaApi(
  app: INestApplication<App>,
  token: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/cash-register/open')
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  return res.body.id as string;
}

export async function seedOrderOnShift(
  prisma: PrismaService,
  restaurantId: string,
  cashShiftId: string,
  productId: string,
) {
  const updatedShift = await prisma.cashShift.update({
    where: { id: cashShiftId },
    data: { lastOrderNumber: { increment: 1 } },
  });

  return prisma.order.create({
    data: {
      orderNumber: updatedShift.lastOrderNumber,
      restaurantId,
      cashShiftId,
      totalAmount: BigInt(1000),
      items: {
        create: [{ productId, quantity: 1, unitPrice: BigInt(1000), subtotal: BigInt(1000) }],
      },
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd apps/api-core
git add test/cash-register/cash-register.helpers.ts
git commit -m "test(cash-register): add cash-register e2e helpers"
```

---

## Task 3: kiosk.helpers.ts

**Files:**
- Create: `test/kiosk/kiosk.helpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
// test/kiosk/kiosk.helpers.ts
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
      slug: `kiosk-${suffix}-${Date.now()}`,
    },
  });

  const category = await prisma.productCategory.create({
    data: { name: 'General', restaurantId: restaurant.id, isDefault: false },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `kiosk-admin-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, category, admin };
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

export async function seedProduct(
  prisma: PrismaService,
  restaurantId: string,
  categoryId: string,
  overrides: { stock?: number | null } = {},
) {
  return prisma.product.create({
    data: {
      name: `Producto ${Date.now()}`,
      price: BigInt(1000),
      stock: overrides.stock !== undefined ? overrides.stock : 10,
      restaurantId,
      categoryId,
    },
  });
}

export async function seedMenu(
  prisma: PrismaService,
  restaurantId: string,
  productId: string,
) {
  return prisma.menu.create({
    data: {
      name: `Menú ${Date.now()}`,
      active: true,
      restaurantId,
      items: {
        create: [{ productId, sectionName: 'Principal', order: 0 }],
      },
    },
    include: { items: true },
  });
}

export async function openCashShift(
  prisma: PrismaService,
  restaurantId: string,
  userId: string,
) {
  return prisma.cashShift.create({
    data: { restaurantId, userId },
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd apps/api-core
git add test/kiosk/kiosk.helpers.ts
git commit -m "test(kiosk): add kiosk e2e helpers"
```

---

## Task 4: listOrders.e2e-spec.ts

**Files:**
- Create: `test/orders/listOrders.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/orders/listOrders.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-list-orders.db');

describe('GET /v1/orders - listOrders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id);
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id, { status: 'PROCESSING' });

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/orders').expect(401);
  });

  it('ADMIN puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('MANAGER puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('BASIC puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('Solo retorna órdenes del propio restaurante (aislamiento)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    const idsA = resA.body.map((o: any) => o.id);
    const idsB = resB.body.map((o: any) => o.id);
    expect(idsA.some((id: string) => idsB.includes(id))).toBe(false);
  });

  it('Filtro por ?status=CREATED retorna solo órdenes CREATED', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?status=CREATED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.every((o: any) => o.status === 'CREATED')).toBe(true);
  });

  it('Cada orden incluye items en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body[0].items)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="listOrders"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/orders/listOrders.e2e-spec.ts
git commit -m "test(orders): add listOrders e2e spec"
```

---

## Task 5: orderHistory.e2e-spec.ts

**Files:**
- Create: `test/orders/orderHistory.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/orders/orderHistory.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-order-history.db');

describe('GET /v1/orders/history - orderHistory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminTokenB: string;
  let orderId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);

    const order = await seedOrder(prisma, restA.restaurant.id, shift.id, product.id);
    orderId = order.id;
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id, { status: 'PROCESSING' });
    await seedOrder(prisma, restA.restaurant.id, shift.id, product.id, { status: 'CANCELLED' });

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/orders/history').expect(401);
  });

  it('Retorna estructura paginada { data, meta }', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.page).toBe('number');
    expect(typeof res.body.meta.limit).toBe('number');
    expect(typeof res.body.meta.totalPages).toBe('number');
  });

  it('Paginación: page=1&limit=1 retorna 1 resultado y meta correcta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('Filtro por status=CANCELLED retorna solo canceladas', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?status=CANCELLED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((o: any) => o.status === 'CANCELLED')).toBe(true);
  });

  it('Filtro por orderNumber retorna la orden específica', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?orderNumber=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.some((o: any) => o.orderNumber === 1)).toBe(true);
  });

  it('Solo retorna órdenes del propio restaurante (aislamiento)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/orders/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/orders/history')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(resB.body.meta.total).toBe(0);
    expect(resA.body.meta.total).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="orderHistory"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/orders/orderHistory.e2e-spec.ts
git commit -m "test(orders): add orderHistory e2e spec"
```

---

## Task 6: findOneOrder.e2e-spec.ts

**Files:**
- Create: `test/orders/findOneOrder.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/orders/findOneOrder.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-find-one-order.db');

describe('GET /v1/orders/:id - findOneOrder (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let orderId: string;
  let orderIdFromB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    const order = await seedOrder(prisma, restA.restaurant.id, shift.id, product.id);
    orderId = order.id;

    const restB = await seedRestaurant(prisma, 'B');
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    const orderB = await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);
    orderIdFromB = orderB.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get(`/v1/orders/${orderId}`).expect(401);
  });

  it('ADMIN puede obtener la orden → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
  });

  it('MANAGER puede obtener la orden → 200', async () => {
    await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
  });

  it('BASIC puede obtener la orden → 200', async () => {
    await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);
  });

  it('Respuesta incluye items[]', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('Orden de otro restaurante → 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderIdFromB}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('Orden inexistente → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="findOneOrder"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/orders/findOneOrder.e2e-spec.ts
git commit -m "test(orders): add findOneOrder e2e spec"
```

---

## Task 7: updateOrderStatus.e2e-spec.ts

**Files:**
- Create: `test/orders/updateOrderStatus.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/orders/updateOrderStatus.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-update-order-status.db');

describe('PATCH /v1/orders/:id/status - updateOrderStatus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .send({ status: 'PROCESSING' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${basicToken}`)
      .send({ status: 'PROCESSING' })
      .expect(403);
  });

  it('CREATED → PROCESSING es transición válida → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(200);

    expect(res.body.status).toBe('PROCESSING');
  });

  it('Transición inválida PROCESSING → CREATED → 400 INVALID_STATUS_TRANSITION', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CREATED' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('Completar orden sin pago → 409 ORDER_NOT_PAID', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);

    expect(res.body.code).toBe('ORDER_NOT_PAID');
  });

  it('Orden ya cancelada → 409 ORDER_ALREADY_CANCELLED', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'CANCELLED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(409);

    expect(res.body.code).toBe('ORDER_ALREADY_CANCELLED');
  });

  it('status inválido en body → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INVALID_STATUS' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="updateOrderStatus"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/orders/updateOrderStatus.e2e-spec.ts
git commit -m "test(orders): add updateOrderStatus e2e spec"
```

---

## Task 8: markOrderAsPaid.e2e-spec.ts

**Files:**
- Create: `test/orders/markOrderAsPaid.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/orders/markOrderAsPaid.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-mark-paid.db');

describe('PATCH /v1/orders/:id/pay - markOrderAsPaid (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;
  let orderIdFromB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;

    const restB = await seedRestaurant(prisma, 'B');
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    const orderB = await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);
    orderIdFromB = orderB.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/pay`)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('ADMIN marca orden como pagada → 200, isPaid: true', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.isPaid).toBe(true);
    expect(res.body.id).toBe(order.id);
  });

  it('Orden de otro restaurante → 404', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/orders/${orderIdFromB}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('Orden inexistente → 404', async () => {
    await request(app.getHttpServer())
      .patch('/v1/orders/non-existent-id/pay')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="markOrderAsPaid"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/orders/markOrderAsPaid.e2e-spec.ts
git commit -m "test(orders): add markOrderAsPaid e2e spec"
```

---

## Task 9: cancelOrder.e2e-spec.ts

**Files:**
- Create: `test/orders/cancelOrder.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/orders/cancelOrder.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

const TEST_DB = path.resolve(__dirname, 'test-cancel-order.db');

describe('PATCH /v1/orders/:id/cancel - cancelOrder (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .send({ reason: 'Test' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${basicToken}`)
      .send({ reason: 'Test' })
      .expect(403);
  });

  it('ADMIN cancela orden CREATED → 200, status: CANCELLED', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Pedido duplicado' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancellationReason).toBe('Pedido duplicado');
  });

  it('ADMIN cancela orden PROCESSING → 200', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'PROCESSING' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Cliente cambió de opinión' })
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
  });

  it('Orden ya cancelada → 409 ORDER_ALREADY_CANCELLED', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'CANCELLED' });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Intento de cancelación doble' })
      .expect(409);

    expect(res.body.code).toBe('ORDER_ALREADY_CANCELLED');
  });

  it('Orden COMPLETED → 400 INVALID_STATUS_TRANSITION', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id, { status: 'COMPLETED', isPaid: true });

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'No se puede cancelar completada' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('reason vacío → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);
    const shift = await openCashShift(prisma, restaurantId, adminId);
    const order = await seedOrder(prisma, restaurantId, shift.id, product.id);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="cancelOrder"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/orders/cancelOrder.e2e-spec.ts
git commit -m "test(orders): add cancelOrder e2e spec"
```

---

## Task 10: openSession.e2e-spec.ts

**Files:**
- Create: `test/cash-register/openSession.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/cash-register/openSession.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-open-session.db');

describe('POST /v1/cash-register/open - openSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).post('/v1/cash-register/open').expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('ADMIN abre sesión → 201 con CashShiftDto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('OPEN');
    expect(res.body.restaurantId).toBeDefined();
    expect(res.body.openedAt).toBeDefined();
  });

  it('Sesión ya abierta → 409 REGISTER_ALREADY_OPEN', async () => {
    // adminToken already has an open session from the previous test
    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(res.body.code).toBe('REGISTER_ALREADY_OPEN');
  });

  it('MANAGER puede abrir su propia sesión → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);

    expect(res.body.status).toBe('OPEN');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="openSession"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/openSession.e2e-spec.ts
git commit -m "test(cash-register): add openSession e2e spec"
```

---

## Task 11: closeSession.e2e-spec.ts

**Files:**
- Create: `test/cash-register/closeSession.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/cash-register/closeSession.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-close-session.db');

describe('POST /v1/cash-register/close - closeSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;
  let basicToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;
    basicToken = await login(app, restA.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).post('/v1/cash-register/close').expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sin sesión abierta → 409 NO_OPEN_REGISTER', async () => {
    // Use a fresh restaurant with no open session
    const restFresh = await seedRestaurant(prisma, 'NoSession');
    const freshToken = await login(app, restFresh.admin.email);

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(409);

    expect(res.body.code).toBe('NO_OPEN_REGISTER');
  });

  it('Cierra sesión → 200 con session y summary', async () => {
    const restC = await seedRestaurant(prisma, 'C');
    const tokenC = await login(app, restC.admin.email);
    const product = await seedProduct(prisma, restC.restaurant.id, restC.category.id);
    const shiftId = await openCashShiftViaApi(app, tokenC);
    await seedOrderOnShift(prisma, restC.restaurant.id, shiftId, product.id);

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.status).toBe('CLOSED');
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.totalOrders).toBe('number');
    expect(typeof res.body.summary.totalSales).toBe('number');
    expect(res.body.summary.totalOrders).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="closeSession"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/closeSession.e2e-spec.ts
git commit -m "test(cash-register): add closeSession e2e spec"
```

---

## Task 12: currentSession.e2e-spec.ts

**Files:**
- Create: `test/cash-register/currentSession.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/cash-register/currentSession.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShiftViaApi } from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-current-session.db');

describe('GET /v1/cash-register/current - currentSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/cash-register/current').expect(401);
  });

  it('Sin sesión abierta → 200 objeto vacío {}', async () => {
    const restA = await seedRestaurant(prisma, 'A');
    const token = await login(app, restA.admin.email);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Object.keys(res.body)).toHaveLength(0);
  });

  it('Con sesión abierta → 200 con CashShiftDto', async () => {
    const restB = await seedRestaurant(prisma, 'B');
    const token = await login(app, restB.admin.email);
    await openCashShiftViaApi(app, token);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('OPEN');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="currentSession"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/currentSession.e2e-spec.ts
git commit -m "test(cash-register): add currentSession e2e spec"
```

---

## Task 13: sessionHistory.e2e-spec.ts

**Files:**
- Create: `test/cash-register/sessionHistory.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/cash-register/sessionHistory.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShiftViaApi } from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-session-history.db');

describe('GET /v1/cash-register/history - sessionHistory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    // Open and close two sessions for restA to have history
    await openCashShiftViaApi(app, adminToken);
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await openCashShiftViaApi(app, adminToken);
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/cash-register/history').expect(401);
  });

  it('Retorna estructura paginada { data, meta }', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.totalPages).toBe('number');
  });

  it('Paginación: page=1&limit=1 retorna 1 resultado', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(1);
  });

  it('Aislamiento por restaurante (restB no ve sesiones de restA)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(res.body.meta.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="sessionHistory"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/sessionHistory.e2e-spec.ts
git commit -m "test(cash-register): add sessionHistory e2e spec"
```

---

## Task 14: sessionSummary.e2e-spec.ts

**Files:**
- Create: `test/cash-register/sessionSummary.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/cash-register/sessionSummary.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-session-summary.db');

describe('GET /v1/cash-register/summary/:sessionId - sessionSummary (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .expect(401);
  });

  it('Sesión inexistente → 404 REGISTER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/summary/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('REGISTER_NOT_FOUND');
  });

  it('Retorna session, summary y orders', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe(shiftId);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  it('summary incluye totalOrders, totalSales y topProducts', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(typeof res.body.summary.totalOrders).toBe('number');
    expect(typeof res.body.summary.totalSales).toBe('number');
    expect(Array.isArray(res.body.summary.topProducts)).toBe(true);
    expect(res.body.summary.totalOrders).toBe(2);
  });

  it('topProducts tiene campos id, name, quantity, total', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    if (res.body.summary.topProducts.length > 0) {
      const top = res.body.summary.topProducts[0];
      expect(top.id).toBeDefined();
      expect(top.name).toBeDefined();
      expect(typeof top.quantity).toBe('number');
      expect(typeof top.total).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="sessionSummary"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/sessionSummary.e2e-spec.ts
git commit -m "test(cash-register): add sessionSummary e2e spec"
```

---

## Task 15: kioskStatus.e2e-spec.ts

**Files:**
- Create: `test/kiosk/kioskStatus.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/kiosk/kioskStatus.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShift } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-status.db');

describe('GET /v1/kiosk/:slug/status - kioskStatus (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let slugWithShift: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    // Restaurant without open shift
    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;

    // Restaurant with open shift
    const restB = await seedRestaurant(prisma, 'B');
    slugWithShift = restB.restaurant.slug;
    await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get('/v1/kiosk/slug-que-no-existe/status')
      .expect(404);
  });

  it('Sin caja abierta → 200, registerOpen: false', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/status`)
      .expect(200);

    expect(res.body.registerOpen).toBe(false);
  });

  it('Con caja abierta → 200, registerOpen: true', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slugWithShift}/status`)
      .expect(200);

    expect(res.body.registerOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="kioskStatus"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/kiosk/kioskStatus.e2e-spec.ts
git commit -m "test(kiosk): add kioskStatus e2e spec"
```

---

## Task 16: kioskMenus.e2e-spec.ts

**Files:**
- Create: `test/kiosk/kioskMenus.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/kiosk/kioskMenus.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, seedProduct, seedMenu } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-menus.db');

describe('GET /v1/kiosk/:slug/menus - kioskMenus (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let slugNoMenus: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    await seedMenu(prisma, restA.restaurant.id, product.id);

    const restB = await seedRestaurant(prisma, 'B');
    slugNoMenus = restB.restaurant.slug;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get('/v1/kiosk/slug-inexistente/menus')
      .expect(404);
  });

  it('Sin menús activos → 200 array vacío', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slugNoMenus}/menus`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('Con menú activo → 200 array con menús', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].id).toBeDefined();
    expect(res.body[0].name).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="kioskMenus"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/kiosk/kioskMenus.e2e-spec.ts
git commit -m "test(kiosk): add kioskMenus e2e spec"
```

---

## Task 17: kioskMenuItems.e2e-spec.ts

**Files:**
- Create: `test/kiosk/kioskMenuItems.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/kiosk/kioskMenuItems.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, seedProduct, seedMenu } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-menu-items.db');

describe('GET /v1/kiosk/:slug/menus/:menuId/items - kioskMenuItems (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let menuId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const menu = await seedMenu(prisma, restA.restaurant.id, product.id);
    menuId = menu.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get(`/v1/kiosk/slug-inexistente/menus/${menuId}/items`)
      .expect(404);
  });

  it('menuId inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus/menu-inexistente/items`)
      .expect(404);
  });

  it('Retorna menuId, menuName y sections', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus/${menuId}/items`)
      .expect(200);

    expect(res.body.menuId).toBe(menuId);
    expect(res.body.menuName).toBeDefined();
    expect(res.body.sections).toBeDefined();
    expect(typeof res.body.sections).toBe('object');
  });

  it('Items agrupados por sección con campos requeridos', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus/${menuId}/items`)
      .expect(200);

    const sectionKeys = Object.keys(res.body.sections);
    expect(sectionKeys.length).toBeGreaterThan(0);

    const firstSection = res.body.sections[sectionKeys[0]];
    expect(Array.isArray(firstSection)).toBe(true);
    const item = firstSection[0];
    expect(item.id).toBeDefined();
    expect(item.menuItemId).toBeDefined();
    expect(item.name).toBeDefined();
    expect(typeof item.price).toBe('number');
    expect(item.stockStatus).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="kioskMenuItems"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/kiosk/kioskMenuItems.e2e-spec.ts
git commit -m "test(kiosk): add kioskMenuItems e2e spec"
```

---

## Task 18: kioskCreateOrder.e2e-spec.ts

**Files:**
- Create: `test/kiosk/kioskCreateOrder.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/kiosk/kioskCreateOrder.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, seedProduct, openCashShift,
} from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-create-order.db');

describe('POST /v1/kiosk/:slug/orders - kioskCreateOrder (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let slugNoShift: string;
  let productId: string;
  let productIdLowStock: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    // Restaurant with open cash shift
    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    productId = product.id;

    // Product with stock = 1 for stock test
    const lowStockProduct = await seedProduct(prisma, restA.restaurant.id, restA.category.id, { stock: 1 });
    productIdLowStock = lowStockProduct.id;

    await openCashShift(prisma, restA.restaurant.id, restA.admin.id);

    // Restaurant without open shift
    const restB = await seedRestaurant(prisma, 'B');
    slugNoShift = restB.restaurant.slug;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .post('/v1/kiosk/slug-inexistente/orders')
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(404);
  });

  it('Sin caja abierta → 409 REGISTER_NOT_OPEN', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slugNoShift}/orders`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(409);

    expect(res.body.code).toBe('REGISTER_NOT_OPEN');
  });

  it('Crea orden exitosamente → 201', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    expect(res.body.order).toBeDefined();
    expect(res.body.order.id).toBeDefined();
    expect(res.body.order.status).toBe('CREATED');
    expect(typeof res.body.order.orderNumber).toBe('number');
  });

  it('Stock insuficiente → 409 STOCK_INSUFFICIENT', async () => {
    // First order consumes the stock=1 product
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId: productIdLowStock, quantity: 1 }] })
      .expect(201);

    // Second order should fail — stock is now 0
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId: productIdLowStock, quantity: 1 }] })
      .expect(409);

    expect(res.body.code).toBe('STOCK_INSUFFICIENT');
  });

  it('items vacío → 400', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [] })
      .expect(400);
  });

  it('quantity < 1 → 400', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId, quantity: 0 }] })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="kioskCreateOrder"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/kiosk/kioskCreateOrder.e2e-spec.ts
git commit -m "test(kiosk): add kioskCreateOrder e2e spec"
```

---

## Task 19: kioskOrderStatus.e2e-spec.ts

**Files:**
- Create: `test/kiosk/kioskOrderStatus.e2e-spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/kiosk/kioskOrderStatus.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, seedProduct, openCashShift } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-order-status.db');

describe('GET /v1/kiosk/:slug/orders/:orderId - kioskOrderStatus (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let orderId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    await openCashShift(prisma, restA.restaurant.id, restA.admin.id);

    // Create an order via kiosk to get a real orderId
    const res = await request(app.getHttpServer())
      .post(`/v1/kiosk/${slug}/orders`)
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    orderId = res.body.order.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Orden inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/orders/id-inexistente`)
      .expect(404);
  });

  it('Retorna estado de la orden → 200', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/orders/${orderId}`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
    expect(res.body.status).toBe('CREATED');
    expect(typeof res.body.orderNumber).toBe('number');
    expect(typeof res.body.totalAmount).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.createdAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api-core
pnpm test:e2e -- --testPathPattern="kioskOrderStatus"
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/kiosk/kioskOrderStatus.e2e-spec.ts
git commit -m "test(kiosk): add kioskOrderStatus e2e spec"
```

---

## Task 20: orders.module.info.md

**Files:**
- Create: `apps/api-core/src/orders/orders.module.info.md`

- [ ] **Step 1: Create the module info file**

Write the file content as shown in the spec (`docs/superpowers/specs/2026-04-16-orders-e2e-tests-design.md`), following the exact format of `apps/api-core/src/products/product.module.info.md`:

- Serialized response shapes for `OrderDto` and `OrderWithItemsDto`
- Endpoints table
- E2E cases table per endpoint with ✅ links to test files
- Implementation notes (BigInt totalAmount, status machine, cash shift dependency)

After writing, verify the file exists:

```bash
ls apps/api-core/src/orders/orders.module.info.md
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/orders/orders.module.info.md
git commit -m "docs(orders): add orders.module.info.md"
```

---

## Task 21: cash-register.module.info.md

**Files:**
- Create: `apps/api-core/src/cash-register/cash-register.module.info.md`

- [ ] **Step 1: Create the module info file**

Follow the format of `product.module.info.md`. Include:

- `CashShiftDto` and `CloseSessionResponseDto` serialized response shapes
- Endpoints table
- E2E cases table per endpoint with ✅ links
- Implementation notes (per-user isolation, atomic close with $transaction, partial index note for PostgreSQL)

```bash
ls apps/api-core/src/cash-register/cash-register.module.info.md
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.module.info.md
git commit -m "docs(cash-register): add cash-register.module.info.md"
```

---

## Task 22: kiosk.module.info.md

**Files:**
- Create: `apps/api-core/src/kiosk/kiosk.module.info.md`

- [ ] **Step 1: Create the module info file**

Follow the format of `product.module.info.md`. Include:

- Response shapes for kiosk status, menus, items, and order creation
- Endpoints table (all marked **PUBLIC — no JWT**)
- E2E cases table per endpoint with ✅ links
- Implementation notes (no auth, menu time-gating logic, registerOpen check)

```bash
ls apps/api-core/src/kiosk/kiosk.module.info.md
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/kiosk/kiosk.module.info.md
git commit -m "docs(kiosk): add kiosk.module.info.md"
```

---

## Task 23: Run full e2e suite and verify

- [ ] **Step 1: Run all e2e tests**

```bash
cd apps/api-core
pnpm test:e2e
```

Expected: all test suites PASS with no failures.

- [ ] **Step 2: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "test: complete orders/cash-register/kiosk e2e coverage"
```
