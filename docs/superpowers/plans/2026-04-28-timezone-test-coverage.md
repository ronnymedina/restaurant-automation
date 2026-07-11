# Timezone Test Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken e2e tests caused by missing `RestaurantSettings` in seed helpers, and add missing unit + e2e coverage for the timezone feature.

**Architecture:** All `seedRestaurant` e2e helpers are updated to create a `RestaurantSettings` row alongside the restaurant (mirroring what `createWithSettings` does in production). Missing unit tests are added for `findHistory` (timezone-aware date conversion) and `getSettings` (controller). A new e2e spec covers `GET /v1/restaurants/settings` and the login `timezone` field. The `orderHistory` e2e gains date-range filter tests with a non-UTC restaurant to validate the `toUtcBoundary` integration end-to-end.

**Tech Stack:** NestJS, Jest, Supertest, Prisma (SQLite for tests)

---

## File Map

### Modified files
| Path | Change |
|---|---|
| `test/orders/orders.helpers.ts` | Add `restaurantSettings.create` in `seedRestaurant`; add `createdAt` to `seedOrder` overrides |
| `test/kiosk/kiosk.helpers.ts` | Add `restaurantSettings.create` in `seedRestaurant` |
| `test/products/products.helpers.ts` | Add `restaurantSettings.create` in `seedRestaurant` |
| `test/cash-register/cash-register.helpers.ts` | Add `restaurantSettings.create` in `seedRestaurant` |
| `test/menus/helpers.ts` | Add `restaurantSettings.create` in `seedRestaurant` |
| `test/restaurants/rename.e2e-spec.ts` | Add `restaurantSettings.create` in inline `seedRestaurant` |
| `src/orders/orders.service.spec.ts` | Add `findHistory` to mock; add `findHistory` test suite |
| `src/restaurants/restaurants.controller.spec.ts` | Add `findByIdWithSettings` to mock; add `getSettings` tests |
| `test/orders/orderHistory.e2e-spec.ts` | Add `dateFrom`/`dateTo` timezone-aware filter tests |

### New files
| Path | Responsibility |
|---|---|
| `test/restaurants/settings.e2e-spec.ts` | E2E for `GET /v1/restaurants/settings` + login `timezone` field |

---

## Task 1: Fix all seedRestaurant helpers — add RestaurantSettings

**Files:**
- Modify: `test/orders/orders.helpers.ts`
- Modify: `test/kiosk/kiosk.helpers.ts`
- Modify: `test/products/products.helpers.ts`
- Modify: `test/cash-register/cash-register.helpers.ts`
- Modify: `test/menus/helpers.ts`
- Modify: `test/restaurants/rename.e2e-spec.ts`

- [ ] **Step 1: Update test/orders/orders.helpers.ts**

In `seedRestaurant`, add `restaurantSettings.create` immediately after `restaurant.create`. The full updated function:

```ts
export async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Restaurant ${suffix} ${Date.now()}`,
      slug: `rest-${suffix}-${Date.now()}`,
    },
  });

  await prisma.restaurantSettings.create({
    data: { restaurantId: restaurant.id, timezone: 'UTC' },
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
```

- [ ] **Step 2: Update test/kiosk/kiosk.helpers.ts**

In `seedRestaurant`, add after `prisma.restaurant.create(...)`:

```ts
await prisma.restaurantSettings.create({
  data: { restaurantId: restaurant.id, timezone: 'UTC' },
});
```

- [ ] **Step 3: Update test/products/products.helpers.ts**

Same one-line addition in `seedRestaurant` after `prisma.restaurant.create`.

- [ ] **Step 4: Update test/cash-register/cash-register.helpers.ts**

Same one-line addition in `seedRestaurant` after `prisma.restaurant.create`.

- [ ] **Step 5: Update test/menus/helpers.ts**

Same one-line addition in `seedRestaurant` after `prisma.restaurant.create`.

- [ ] **Step 6: Update the inline seedRestaurant in test/restaurants/rename.e2e-spec.ts**

Find the local `seedRestaurant` function and add after `prisma.restaurant.create(...)`:

```ts
await prisma.restaurantSettings.create({
  data: { restaurantId: restaurant.id, timezone: 'UTC' },
});
```

- [ ] **Step 7: Run all e2e tests**

```bash
cd apps/api-core && pnpm test:e2e
```

Expected: tests that previously returned 500 (kiosk, orderHistory) now pass with 200.

- [ ] **Step 8: Commit**

```bash
git add test/
git commit -m "fix(e2e): create RestaurantSettings in all seedRestaurant helpers"
```

---

## Task 2: Add findHistory unit tests to orders.service.spec.ts

**Files:**
- Modify: `src/orders/orders.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add `findHistory` describe block at the end of `describe('OrdersService', ...)` (before the outer closing `});`):

```ts
describe('findHistory', () => {
  beforeEach(() => {
    mockOrderRepository.findHistory.mockResolvedValue({ data: [], total: 0 });
  });

  it('always calls getTimezone with the restaurantId', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('UTC');
    await service.findHistory('r1', { page: 1, limit: 10 });
    expect(mockTimezoneService.getTimezone).toHaveBeenCalledWith('r1');
  });

  it('passes undefined dateFrom and dateTo when no dates provided', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('UTC');
    await service.findHistory('r1', { page: 1, limit: 10 });
    expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
    );
  });

  it('converts dateFrom to UTC start-of-day boundary for the restaurant timezone', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('America/Mexico_City');
    await service.findHistory('r1', { dateFrom: '2026-01-15', page: 1, limit: 10 });
    // Mexico City is UTC-6 in January; midnight local = 06:00 UTC
    expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ dateFrom: new Date('2026-01-15T06:00:00.000Z') }),
    );
  });

  it('converts dateTo to UTC end-of-day boundary for the restaurant timezone', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('America/Mexico_City');
    await service.findHistory('r1', { dateTo: '2026-01-15', page: 1, limit: 10 });
    // End of Jan 15 in Mexico City = 2026-01-16T05:59:59.999Z UTC
    expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ dateTo: new Date('2026-01-16T05:59:59.999Z') }),
    );
  });

  it('forwards page and limit to the repository', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('UTC');
    await service.findHistory('r1', { page: 3, limit: 5 });
    expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ page: 3, limit: 5 }),
    );
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=orders.service
```

Expected: FAIL — `mockOrderRepository.findHistory is not a function` (method is missing from the mock).

- [ ] **Step 3: Add findHistory to the mock object**

Find `mockOrderRepository` in the spec and add the missing method:

```ts
const mockOrderRepository = {
  findById: jest.fn(),
  createWithItems: jest.fn(),
  updateStatus: jest.fn(),
  cancelOrder: jest.fn(),
  markAsPaid: jest.fn(),
  findByRestaurantId: jest.fn(),
  findHistory: jest.fn(),
};
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=orders.service
```

Expected: PASS — all tests including the new `findHistory` suite.

- [ ] **Step 5: Commit**

```bash
git add src/orders/orders.service.spec.ts
git commit -m "test(orders): add findHistory unit tests for timezone-aware date conversion"
```

---

## Task 3: Add getSettings unit test to restaurants.controller.spec.ts

**Files:**
- Modify: `src/restaurants/restaurants.controller.spec.ts`

- [ ] **Step 1: Write the failing tests**

1. Add `findByIdWithSettings` to the mock service:

```ts
const mockRestaurantsService = {
  rename: jest.fn(),
  findByIdWithSettings: jest.fn(),
};
```

2. Add the `getSettings` describe block inside `describe('RestaurantsController', ...)`:

```ts
describe('getSettings', () => {
  it('returns timezone from restaurant settings', async () => {
    mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { timezone: 'America/Mexico_City' },
    });
    const result = await controller.getSettings({ restaurantId: 'r1' });
    expect(mockRestaurantsService.findByIdWithSettings).toHaveBeenCalledWith('r1');
    expect(result).toEqual({ timezone: 'America/Mexico_City' });
  });

  it('returns UTC when settings is null', async () => {
    mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
      id: 'r1',
      settings: null,
    });
    const result = await controller.getSettings({ restaurantId: 'r1' });
    expect(result).toEqual({ timezone: 'UTC' });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=restaurants.controller
```

Expected: PASS — both `getSettings` tests and the existing `rename` test.

- [ ] **Step 3: Commit**

```bash
git add src/restaurants/restaurants.controller.spec.ts
git commit -m "test(restaurants): add getSettings controller unit tests"
```

---

## Task 4: Create e2e test for GET /restaurants/settings

**Files:**
- Create: `test/restaurants/settings.e2e-spec.ts`

- [ ] **Step 1: Create the spec file**

```ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_DB = path.resolve(__dirname, 'test-settings.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: { name: `Restaurant ${suffix}`, slug: `rest-settings-${suffix}-${Date.now()}` },
  });
  await prisma.restaurantSettings.create({
    data: { restaurantId: restaurant.id, timezone: 'UTC' },
  });
  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.create({
    data: {
      email: `admin-settings-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });
  return { restaurant, admin };
}

async function loginFull(
  app: INestApplication<App>,
  email: string,
): Promise<{ accessToken: string; timezone: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect(200);
  return { accessToken: res.body.accessToken as string, timezone: res.body.timezone as string };
}

describe('GET /v1/restaurants/settings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let restaurantId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    const { restaurant, admin } = await seedRestaurant(prisma, 'A');
    restaurantId = restaurant.id;
    const auth = await loginFull(app, admin.email);
    adminToken = auth.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).get('/v1/restaurants/settings').expect(401);
  });

  it('returns { timezone: "UTC" } for a default restaurant', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/restaurants/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toEqual({ timezone: 'UTC' });
  });

  it('returns updated timezone after settings change', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: { timezone: 'America/Mexico_City' },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/restaurants/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toEqual({ timezone: 'America/Mexico_City' });
  });

  it('login response includes the restaurant timezone field', async () => {
    const { restaurant, admin } = await seedRestaurant(prisma, 'B');
    await prisma.restaurantSettings.update({
      where: { restaurantId: restaurant.id },
      data: { timezone: 'America/Argentina/Buenos_Aires' },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: admin.email, password: 'Admin1234!' })
      .expect(200);

    expect(res.body.timezone).toBe('America/Argentina/Buenos_Aires');
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=settings
```

Expected: PASS — 4 tests passing.

- [ ] **Step 3: Commit**

```bash
git add test/restaurants/settings.e2e-spec.ts
git commit -m "test(e2e): add GET /restaurants/settings and login timezone field tests"
```

---

## Task 5: Add dateFrom/dateTo e2e tests to orderHistory

**Files:**
- Modify: `test/orders/orders.helpers.ts`
- Modify: `test/orders/orderHistory.e2e-spec.ts`

- [ ] **Step 1: Extend seedOrder to accept createdAt override**

In `test/orders/orders.helpers.ts`, update the `seedOrder` signature and body:

```ts
export async function seedOrder(
  prisma: PrismaService,
  restaurantId: string,
  cashShiftId: string,
  productId: string,
  overrides: { status?: string; isPaid?: boolean; createdAt?: Date } = {},
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
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      items: {
        create: [{ productId, quantity: 1, unitPrice: BigInt(1000), subtotal: BigInt(1000) }],
      },
    },
    include: { items: true },
  });
}
```

- [ ] **Step 2: Add the timezone date-filter tests to orderHistory.e2e-spec.ts**

At the end of the outer `describe` block (after the existing isolation test), add:

```ts
describe('Filtro por fecha con timezone (America/Mexico_City)', () => {
  let tzToken: string;
  let orderInDayId: string;
  let orderOutBeforeId: string;
  let orderOutAfterId: string;

  beforeAll(async () => {
    // Separate restaurant with Mexico City timezone (UTC-6 in January)
    const rest = await seedRestaurant(prisma, 'TZ');
    tzToken = await login(app, rest.admin.email);

    await prisma.restaurantSettings.update({
      where: { restaurantId: rest.restaurant.id },
      data: { timezone: 'America/Mexico_City' },
    });

    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shift = await openCashShift(prisma, rest.restaurant.id, rest.admin.id);

    // Jan 14, 23:59:59 Mexico City = 2026-01-15T05:59:59Z (NOT in Jan 15 local)
    const before = await seedOrder(prisma, rest.restaurant.id, shift.id, product.id, {
      createdAt: new Date('2026-01-15T05:59:59.000Z'),
    });
    orderOutBeforeId = before.id;

    // Jan 15, 00:00:00 Mexico City = 2026-01-15T06:00:00Z (IS in Jan 15 local)
    const inside = await seedOrder(prisma, rest.restaurant.id, shift.id, product.id, {
      createdAt: new Date('2026-01-15T06:00:00.000Z'),
    });
    orderInDayId = inside.id;

    // Jan 16, 00:00:00 Mexico City = 2026-01-16T06:00:00Z (NOT in Jan 15 local)
    const after = await seedOrder(prisma, rest.restaurant.id, shift.id, product.id, {
      createdAt: new Date('2026-01-16T06:00:00.000Z'),
    });
    orderOutAfterId = after.id;
  });

  it('?dateFrom=2026-01-15&dateTo=2026-01-15 incluye solo órdenes del día local', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?dateFrom=2026-01-15&dateTo=2026-01-15')
      .set('Authorization', `Bearer ${tzToken}`)
      .expect(200);

    const ids = res.body.data.map((o: any) => o.id);
    expect(ids).toContain(orderInDayId);
    expect(ids).not.toContain(orderOutBeforeId);
    expect(ids).not.toContain(orderOutAfterId);
  });

  it('?dateFrom=2026-01-15 excluye órdenes anteriores al inicio del día local', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?dateFrom=2026-01-15')
      .set('Authorization', `Bearer ${tzToken}`)
      .expect(200);

    const ids = res.body.data.map((o: any) => o.id);
    expect(ids).not.toContain(orderOutBeforeId);
    expect(ids).toContain(orderInDayId);
  });

  it('?dateTo=2026-01-15 excluye órdenes posteriores al fin del día local', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders/history?dateTo=2026-01-15')
      .set('Authorization', `Bearer ${tzToken}`)
      .expect(200);

    const ids = res.body.data.map((o: any) => o.id);
    expect(ids).not.toContain(orderOutAfterId);
    expect(ids).toContain(orderOutBeforeId);
    expect(ids).toContain(orderInDayId);
  });
});
```

- [ ] **Step 3: Run the updated e2e spec**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=orderHistory
```

Expected: PASS — all existing tests plus the 3 new timezone-filter tests.

- [ ] **Step 4: Commit**

```bash
git add test/orders/orders.helpers.ts test/orders/orderHistory.e2e-spec.ts
git commit -m "test(e2e): add timezone-aware dateFrom/dateTo filter tests for order history"
```

---

## Self-Review

**Spec coverage:**

| Gap identified | Covered by |
|---|---|
| All seedRestaurant helpers missing RestaurantSettings | Task 1 |
| `findHistory` unit tests | Task 2 |
| `getSettings` controller unit test | Task 3 |
| `GET /restaurants/settings` e2e | Task 4 |
| Login response `timezone` field e2e | Task 4 |
| dateFrom/dateTo e2e filter with non-UTC timezone | Task 5 |

**Placeholder scan:** ✅ All code blocks are complete with no TBDs.

**Type consistency:**
- `seedOrder` override type extended in Task 5 Step 1; used in Step 2 — ✅
- `mockOrderRepository.findHistory` added in Task 2 Step 3; called in test `beforeEach` — ✅
- `mockRestaurantsService.findByIdWithSettings` added in Task 3 Step 1; called in both tests — ✅
