# Orders KDS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the KDS orders page on an active cash session, add cashShiftId/orderNumber filters to `GET /v1/orders`, and migrate the monolithic `orders.astro` to a React component tree.

**Architecture:** Backend adds two optional query params to the existing orders endpoint plus input validation via NestJS pipes; a role fix lets BASIC users read the active session. Frontend replaces the inline `<script>` Astro page with a component tree (`OrdersPanel → OrdersKanban | OrdersFilteredList`) following the same pattern as `register.astro`.

**Tech Stack:** NestJS (ParseEnumPipe, ParseIntPipe), Prisma, React + Vitest + @testing-library/react, Astro, Tailwind CSS.

---

## File Map

### Backend (`apps/api-core`)

| Action | File |
|---|---|
| Modify | `src/orders/order.repository.ts` |
| Modify | `src/orders/orders.service.ts` |
| Modify | `src/orders/orders.service.spec.ts` |
| Modify | `src/orders/orders.controller.ts` |
| Modify | `src/cash-register/cash-register.controller.ts` |
| Modify | `test/orders/listOrders.e2e-spec.ts` |
| Modify | `test/cash-register/currentSession.e2e-spec.ts` |

### Frontend (`apps/ui`)

| Action | File |
|---|---|
| Create | `src/components/dash/orders/types.ts` |
| Create | `src/components/dash/orders/api.ts` |
| Create | `src/components/dash/orders/OrderCard.tsx` |
| Create | `src/components/dash/orders/CancelOrderModal.tsx` |
| Create | `src/components/dash/orders/OrderFilterPanel.tsx` |
| Create | `src/components/dash/orders/OrdersFilteredList.tsx` |
| Create | `src/components/dash/orders/OrdersKanban.tsx` |
| Create | `src/components/dash/orders/OrdersPanel.test.tsx` |
| Create | `src/components/dash/orders/OrdersPanel.tsx` |
| Modify | `src/pages/dash/orders.astro` |

---

## Task 1: Write failing e2e tests — new filter params

**Files:**
- Modify: `test/orders/listOrders.e2e-spec.ts`

- [ ] **Step 1: Update beforeAll to seed two shifts for restA**

Replace the entire `beforeAll` in `test/orders/listOrders.e2e-spec.ts` and add `shiftAId`, `shiftBId`, `restBShiftId` variables:

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

  let shiftAId: string;
  let shiftBId: string;
  let restBShiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);

    // shiftA: 2 orders (orderNumber 1 = CREATED, orderNumber 2 = PROCESSING)
    const shiftA = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    shiftAId = shiftA.id;
    await seedOrder(prisma, restA.restaurant.id, shiftA.id, product.id);
    await seedOrder(prisma, restA.restaurant.id, shiftA.id, product.id, { status: 'PROCESSING' });

    // shiftB: 1 order (orderNumber 1 = CREATED)
    const shiftB = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    shiftBId = shiftB.id;
    await seedOrder(prisma, restA.restaurant.id, shiftB.id, product.id);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftRestB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    restBShiftId = shiftRestB.id;
    await seedOrder(prisma, restB.restaurant.id, shiftRestB.id, productB.id);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });
```

- [ ] **Step 2: Keep all existing test cases, update the limit test, and add new tests**

Add these tests at the end of the describe block (before the closing `}`). Update the existing limit test from 15 to 30, then add the 6 new tests:

```typescript
  // existing tests (keep as-is, except the limit test below)
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

  it('Cada orden incluye displayTime en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0].displayTime).toBe('string');
    expect(res.body[0].displayTime).toMatch(/^\d{2}:\d{2}$/);
  });

  // --- new tests ---

  it('?cashShiftId=shiftA → solo retorna órdenes de shiftA', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${shiftAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.cashShiftId === shiftAId)).toBe(true);
  });

  it('?cashShiftId=shiftB → solo retorna órdenes de shiftB', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${shiftBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.cashShiftId === shiftBId)).toBe(true);
  });

  it('?cashShiftId=<turno de restB> con token de restA → array vacío (aislamiento cross-restaurant)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${restBShiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('?orderNumber=1 → solo retorna órdenes con orderNumber=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?orderNumber=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.orderNumber === 1)).toBe(true);
  });

  it('?cashShiftId=shiftA&orderNumber=1 → retorna exactamente 1 orden', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/orders?cashShiftId=${shiftAId}&orderNumber=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].cashShiftId).toBe(shiftAId);
    expect(res.body[0].orderNumber).toBe(1);
  });

  it('?limit=500 retorna máximo 30 órdenes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?limit=500')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(30);
  });

  it('?status=INVALID_VALUE → 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/orders?status=INVALID_VALUE')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
```

- [ ] **Step 3: Run the e2e tests to confirm they fail**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=listOrders
```

Expected: 7+ failures (cashShiftId filter not supported, limit still 15, status accepts any string).

- [ ] **Step 4: Commit**

```bash
git add test/orders/listOrders.e2e-spec.ts
git commit -m "test(orders): add failing e2e tests for cashShiftId, orderNumber, limit 30, and status validation"
```

---

## Task 2: Write failing e2e test — BASIC user on /current

**Files:**
- Modify: `test/cash-register/currentSession.e2e-spec.ts`

- [ ] **Step 1: Add BASIC user test to currentSession.e2e-spec.ts**

Add this test at the end of the describe block in `test/cash-register/currentSession.e2e-spec.ts`:

```typescript
  it('BASIC puede acceder a la sesión actual → 200 (no 403)', async () => {
    const restD = await seedRestaurant(prisma, 'D');
    const basicToken = await login(app, restD.basic.email);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/current')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);

    // No active session → empty object
    expect(Object.keys(res.body)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=currentSession
```

Expected: 1 failure (BASIC user receives 403 instead of 200).

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/currentSession.e2e-spec.ts
git commit -m "test(cash-register): add failing e2e test for BASIC access to current session"
```

---

## Task 3: Update repository — add cashShiftId and orderNumber filters

**Files:**
- Modify: `src/orders/order.repository.ts`

- [ ] **Step 1: Update findByRestaurantId signature and where clause**

In `src/orders/order.repository.ts`, replace the `findByRestaurantId` method:

```typescript
  async findByRestaurantId(
    restaurantId: string,
    status?: OrderStatus,
    statuses?: OrderStatus[],
    limit?: number,
    cashShiftId?: string,
    orderNumber?: number,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        ...(statuses?.length ? { status: { in: statuses } } : status ? { status } : {}),
        ...(cashShiftId ? { cashShiftId } : {}),
        ...(orderNumber ? { orderNumber } : {}),
      },
      include: ORDER_WITH_ITEMS,
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
    return orders.map(serializeOrder);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/orders/order.repository.ts
git commit -m "feat(orders): add cashShiftId and orderNumber filters to order repository"
```

---

## Task 4: Update service — pass new params through; fix service spec

**Files:**
- Modify: `src/orders/orders.service.ts`
- Modify: `src/orders/orders.service.spec.ts`

- [ ] **Step 1: Update findByRestaurantId in orders.service.ts**

Replace the `findByRestaurantId` method in `src/orders/orders.service.ts`:

```typescript
  async findByRestaurantId(
    restaurantId: string,
    status?: OrderStatus,
    limit?: number,
    cashShiftId?: string,
    orderNumber?: number,
  ) {
    return this.orderRepository.findByRestaurantId(restaurantId, status, undefined, limit, cashShiftId, orderNumber);
  }
```

- [ ] **Step 2: Update orders.service.spec.ts assertions for findByRestaurantId**

In `src/orders/orders.service.spec.ts`, find the `findByRestaurantId` describe block and update the two `toHaveBeenCalledWith` assertions:

```typescript
    it('passes status filter and limit to repository', async () => {
      mockOrderRepository.findByRestaurantId.mockResolvedValue([]);
      await service.findByRestaurantId('r1', OrderStatus.CREATED, 15);
      expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith(
        'r1', OrderStatus.CREATED, undefined, 15, undefined, undefined,
      );
    });

    it('passes undefined limit when not provided', async () => {
      mockOrderRepository.findByRestaurantId.mockResolvedValue([]);
      await service.findByRestaurantId('r1', OrderStatus.PROCESSING);
      expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith(
        'r1', OrderStatus.PROCESSING, undefined, undefined, undefined, undefined,
      );
    });
```

- [ ] **Step 3: Run unit tests to verify they still pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/orders/orders.service.ts src/orders/orders.service.spec.ts
git commit -m "feat(orders): pass cashShiftId and orderNumber through service; update spec assertions"
```

---

## Task 5: Update controller — pipes, cashShiftId param, limit 30, Swagger

**Files:**
- Modify: `src/orders/orders.controller.ts`

- [ ] **Step 1: Replace the findAll method in orders.controller.ts**

```typescript
import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { Role, OrderStatus } from '@prisma/client';
import { ParseEnumPipe } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';

// ... keep existing imports below this line
```

Replace the `findAll` method:

```typescript
  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar órdenes del restaurante' })
  @ApiQuery({ name: 'cashShiftId', required: false, type: String, description: 'Filtrar por sesión de caja' })
  @ApiQuery({ name: 'orderNumber', required: false, type: Number, description: 'Filtrar por número de orden (coincidencia exacta)' })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo de registros (default 30, max 30)' })
  @ApiResponse({ status: 200, description: 'Lista de órdenes', type: [OrderDto] })
  @ApiResponse({ status: 400, description: 'Parámetro inválido (status o orderNumber)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query('cashShiftId') cashShiftId?: string,
    @Query('orderNumber', new ParseIntPipe({ optional: true })) orderNumber?: number,
    @Query('status', new ParseEnumPipe(OrderStatus, { optional: true })) status?: OrderStatus,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(30, Math.max(1, parseInt(limit, 10) || 30)) : 30;
    const orders = await this.ordersService.findByRestaurantId(
      user.restaurantId, status, take, cashShiftId, orderNumber,
    );
    const tz = await this.timezoneService.getTimezone(user.restaurantId);
    return orders.map(o => ({
      ...o,
      displayTime: new Intl.DateTimeFormat('es', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(o.createdAt)),
    }));
  }
```

The full updated import block at the top of the file:

```typescript
import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, ParseIntPipe, ParseEnumPipe,
} from '@nestjs/common';
import { Role, OrderStatus } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrderDto, OrderWithItemsDto } from './dto/order.dto';
import { TimezoneService } from '../restaurants/timezone.service';
```

- [ ] **Step 2: Commit**

```bash
git add src/orders/orders.controller.ts
git commit -m "feat(orders): add cashShiftId/orderNumber params, ParseEnumPipe for status, limit 15→30"
```

---

## Task 6: Fix permission — BASIC can read cash-register/current

**Files:**
- Modify: `src/cash-register/cash-register.controller.ts`

- [ ] **Step 1: Add @Roles decorator to the current handler**

In `src/cash-register/cash-register.controller.ts`, add a `@Roles` decorator to the `current` method (it currently inherits `ADMIN, MANAGER` from the class-level decorator):

```typescript
  @Get('current')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Sesión de caja actualmente abierta' })
  @ApiResponse({ status: 200, type: CashShiftSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN, MANAGER o BASIC)' })
  async current(@CurrentUser() user: { restaurantId: string }) {
    const [session, tz] = await Promise.all([
      this.registerService.getCurrentSession(user.restaurantId),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    if (!('id' in session)) return {};
    return new CashShiftSerializer(session as any, tz);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/cash-register/cash-register.controller.ts
git commit -m "fix(cash-register): allow BASIC role to read current session (read-only endpoint)"
```

---

## Task 7: Run all backend e2e tests — verify green

- [ ] **Step 1: Run listOrders e2e tests**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=listOrders
```

Expected: all 13 tests pass.

- [ ] **Step 2: Run currentSession e2e tests**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=currentSession
```

Expected: all 5 tests pass (including the new BASIC test).

- [ ] **Step 3: Run full unit test suite**

```bash
docker compose exec res-api-core pnpm test
```

Expected: all pass.

- [ ] **Step 4: Commit if any fixes were needed**

If any test required a correction, commit the fix before proceeding.

---

## Task 8: Create frontend types.ts

**Files:**
- Create: `apps/ui/src/components/dash/orders/types.ts`

- [ ] **Step 1: Create the file**

```typescript
export const ORDERS_STATUS = {
  LOADING: 'loading',
  OPEN: 'open',
  CLOSED: 'closed',
  ERROR: 'error',
} as const;

export type OrdersStatus = (typeof ORDERS_STATUS)[keyof typeof ORDERS_STATUS];

export const ORDER_STATUS = {
  CREATED: 'CREATED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/types.ts
git commit -m "feat(ui/orders): add shared types for OrdersPanel status and OrderStatus enum"
```

---

## Task 9: Create frontend api.ts

**Files:**
- Create: `apps/ui/src/components/dash/orders/api.ts`

- [ ] **Step 1: Create the file**

```typescript
import { apiFetch } from '../../../lib/api';

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  product?: { name: string };
}

export interface Order {
  id: string;
  orderNumber: number;
  cashShiftId: string;
  status: string;
  totalAmount: number;
  isPaid: boolean;
  paymentMethod?: string;
  cancellationReason?: string;
  createdAt: string;
  displayTime?: string;
  items: OrderItem[];
}

export interface CurrentSession {
  id: string;
  openedByEmail: string | null;
}

interface ApiError {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; httpStatus: number };

export async function getCurrentSession(): Promise<ApiResult<CurrentSession | null>> {
  const res = await apiFetch('/v1/cash-register/current');
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  if (!data || !('id' in data)) return { ok: true, data: null };
  return { ok: true, data: data as CurrentSession };
}

export async function getOrders(params: {
  cashShiftId?: string;
  orderNumber?: number;
  status?: string;
  limit?: number;
}): Promise<ApiResult<Order[]>> {
  const query = new URLSearchParams();
  if (params.cashShiftId) query.set('cashShiftId', params.cashShiftId);
  if (params.orderNumber !== undefined) query.set('orderNumber', String(params.orderNumber));
  if (params.status) query.set('status', params.status);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const res = await apiFetch(`/v1/orders?${query}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function updateOrderStatus(id: string, status: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function markOrderPaid(id: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/pay`, { method: 'PATCH' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function cancelOrder(id: string, reason: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/api.ts
git commit -m "feat(ui/orders): add typed API wrappers for orders and cash session"
```

---

## Task 10: Create OrderCard.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrderCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { Order } from './api';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Digital',
};

const BORDER_COLORS: Record<string, string> = {
  CREATED: 'border-l-yellow-400',
  PROCESSING: 'border-l-blue-400',
  COMPLETED: 'border-l-green-400',
  CANCELLED: 'border-l-red-400',
};

export interface OrderCardCallbacks {
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string) => void;
  onCancel: (id: string) => void;
  onReceipt: (id: string) => void;
}

interface OrderCardProps extends OrderCardCallbacks {
  order: Order;
}

export default function OrderCard({ order, onAdvance, onPay, onCancel, onReceipt }: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${border} shadow-sm`}>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800">#{order.orderNumber}</span>
          <span className="text-xs text-slate-500">{order.displayTime}</span>
        </div>
        <div className="space-y-0.5">
          {(order.items ?? []).map((item) => (
            <div key={item.id}>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{item.quantity}x</span> {item.product?.name ?? '?'}
              </p>
              {item.notes && (
                <p className="text-xs italic text-amber-600 ml-5">{item.notes}</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="font-semibold text-sm text-slate-800">
            ${Number(order.totalAmount).toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">
            {PAYMENT_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '-'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {order.isPaid ? (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">
              Pagado
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
              No pagado
            </span>
          )}
        </div>
        {order.status === 'CANCELLED' && order.cancellationReason && (
          <p className="text-xs text-red-600 italic mt-1">Motivo: {order.cancellationReason}</p>
        )}
        <div className="flex gap-1.5 flex-wrap pt-1">
          {order.status === 'CREATED' && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'PROCESSING')}
              className="flex-1 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg cursor-pointer border-none hover:bg-blue-600"
            >
              Procesar
            </button>
          )}
          {order.status === 'PROCESSING' && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'COMPLETED')}
              className="flex-1 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg cursor-pointer border-none hover:bg-green-600"
            >
              Completar
            </button>
          )}
          {!order.isPaid && order.status !== 'CANCELLED' && (
            <button
              type="button"
              onClick={() => onPay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer border-none hover:bg-emerald-200"
            >
              Marcar Pagado
            </button>
          )}
          {(order.status === 'CREATED' || order.status === 'PROCESSING') && (
            <button
              type="button"
              onClick={() => onCancel(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-red-100 text-red-700 rounded-lg cursor-pointer border-none hover:bg-red-200"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => onReceipt(order.id)}
            className="py-1.5 px-2 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg cursor-pointer border-none hover:bg-slate-200"
          >
            Recibo
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(ui/orders): add OrderCard component"
```

---

## Task 11: Create CancelOrderModal.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/CancelOrderModal.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';

interface CancelOrderModalProps {
  orderId: string;
  onConfirm: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}

export default function CancelOrderModal({ orderId, onConfirm, onClose }: CancelOrderModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError(true);
      return;
    }
    setLoading(true);
    await onConfirm(orderId, reason.trim());
    setLoading(false);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold text-slate-800">Cancelar pedido</h3>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Motivo de cancelación *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(false); }}
            placeholder="Ej: Pedido duplicado, error del cliente..."
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              error ? 'border-red-400 ring-red-400' : 'border-slate-300 focus:ring-slate-400'
            }`}
            autoFocus
          />
          {error && (
            <p className="mt-1 text-xs text-red-500">El motivo es requerido</p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium cursor-pointer border-none hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? 'Cancelando...' : 'Confirmar cancelación'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/CancelOrderModal.tsx
git commit -m "feat(ui/orders): add CancelOrderModal component"
```

---

## Task 12: Create OrderFilterPanel.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrderFilterPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import { ORDER_STATUS, type OrderStatus } from './types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: 'Creado',
  PROCESSING: 'En Proceso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export interface FilterValues {
  orderNumber?: number;
  statuses: OrderStatus[];
}

interface OrderFilterPanelProps {
  onApply: (filters: FilterValues) => void;
  onClose: () => void;
}

export default function OrderFilterPanel({ onApply, onClose }: OrderFilterPanelProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);

  function toggleStatus(s: OrderStatus) {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function handleApply() {
    onApply({
      orderNumber: orderNumber ? parseInt(orderNumber, 10) : undefined,
      statuses,
    });
  }

  function handleClear() {
    setOrderNumber('');
    setStatuses([]);
    onApply({ statuses: [] });
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={handleBackdropClick}
    >
      <div className="absolute right-0 top-0 h-full w-80 bg-white shadow-xl border-l border-slate-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Filtros</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
          >
            ✕
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">N° de pedido</label>
          <input
            type="number"
            min={1}
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Ej: 12"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
          <div className="space-y-2">
            {(Object.values(ORDER_STATUS) as OrderStatus[]).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">{STATUS_LABELS[s]}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleApply}
            className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium cursor-pointer border-none hover:bg-slate-700"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderFilterPanel.tsx
git commit -m "feat(ui/orders): add OrderFilterPanel sidebar component"
```

---

## Task 13: Create OrdersFilteredList.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrdersFilteredList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { Order } from './api';
import type { OrderCardCallbacks } from './OrderCard';
import OrderCard from './OrderCard';

interface OrdersFilteredListProps extends OrderCardCallbacks {
  orders: Order[];
  filterLabel: string;
  onClearFilter: () => void;
}

export default function OrdersFilteredList({
  orders,
  filterLabel,
  onClearFilter,
  onAdvance,
  onPay,
  onCancel,
  onReceipt,
}: OrdersFilteredListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium">
          <span>Filtro activo: {filterLabel}</span>
          <button
            type="button"
            onClick={onClearFilter}
            className="hover:text-blue-600 cursor-pointer ml-1"
            aria-label="Limpiar filtro"
          >
            ✕
          </button>
        </div>
        <span className="text-sm text-slate-500">
          {orders.length} resultado{orders.length !== 1 ? 's' : ''}
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin resultados</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={onAdvance}
              onPay={onPay}
              onCancel={onCancel}
              onReceipt={onReceipt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersFilteredList.tsx
git commit -m "feat(ui/orders): add OrdersFilteredList component for filter mode"
```

---

## Task 14: Create OrdersKanban.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrdersKanban.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import type { Order } from './api';
import type { OrderCardCallbacks } from './OrderCard';
import OrderCard from './OrderCard';

const PRIMARY_COLUMNS = [
  {
    status: 'CREATED',
    label: 'Creado',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badgeBg: 'bg-yellow-200',
  },
  {
    status: 'PROCESSING',
    label: 'En Proceso',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badgeBg: 'bg-blue-200',
  },
];

const SECONDARY_COLUMNS = [
  {
    status: 'COMPLETED',
    label: 'Completado',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    badgeBg: 'bg-green-200',
  },
  {
    status: 'CANCELLED',
    label: 'Cancelado',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    badgeBg: 'bg-red-200',
  },
];

interface OrdersKanbanProps extends OrderCardCallbacks {
  orders: Order[];
}

export default function OrdersKanban({ orders, onAdvance, onPay, onCancel, onReceipt }: OrdersKanbanProps) {
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);

  const byStatus = (status: string) => orders.filter((o) => o.status === status);
  const cardCallbacks = { onAdvance, onPay, onCancel, onReceipt };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {PRIMARY_COLUMNS.map(({ status, label, bg, border, text, badgeBg }) => {
          const col = byStatus(status);
          return (
            <div key={status} className="flex flex-col">
              <div className={`${bg} border ${border} rounded-t-xl px-4 py-3 flex items-center justify-between`}>
                <h3 className={`font-bold ${text}`}>{label}</h3>
                <span className={`text-xs font-medium ${badgeBg} ${text} px-2 py-0.5 rounded-full`}>
                  {col.length}
                </span>
              </div>
              <div
                className={`flex-1 ${bg}/30 border-x border-b ${border} rounded-b-xl p-3 space-y-3 overflow-y-auto max-h-[70vh]`}
              >
                {col.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Sin pedidos</p>
                ) : (
                  col.map((order) => (
                    <OrderCard key={order.id} order={order} {...cardCallbacks} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setSecondaryExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
      >
        <span className="flex items-center gap-4">
          {SECONDARY_COLUMNS.map(({ status, label, text }) => (
            <span key={status} className={`font-medium ${text}`}>
              {label} ({byStatus(status).length})
            </span>
          ))}
        </span>
        <span>{secondaryExpanded ? '▲' : '▼'}</span>
      </button>

      {secondaryExpanded && (
        <div className="grid grid-cols-2 gap-4">
          {SECONDARY_COLUMNS.map(({ status, label, bg, border, text, badgeBg }) => {
            const col = byStatus(status);
            return (
              <div key={status} className="flex flex-col">
                <div className={`${bg} border ${border} rounded-t-xl px-4 py-3 flex items-center justify-between`}>
                  <h3 className={`font-bold ${text}`}>{label}</h3>
                  <span className={`text-xs font-medium ${badgeBg} ${text} px-2 py-0.5 rounded-full`}>
                    {col.length}
                  </span>
                </div>
                <div
                  className={`flex-1 ${bg}/30 border-x border-b ${border} rounded-b-xl p-3 space-y-3 overflow-y-auto max-h-[50vh]`}
                >
                  {col.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Sin pedidos</p>
                  ) : (
                    col.map((order) => (
                      <OrderCard key={order.id} order={order} {...cardCallbacks} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersKanban.tsx
git commit -m "feat(ui/orders): add OrdersKanban with collapsible secondary columns"
```

---

## Task 15: Write failing OrdersPanel tests

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import OrdersPanel from './OrdersPanel';

vi.mock('./api', () => ({
  getCurrentSession: vi.fn(),
  getOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  markOrderPaid: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({ getAccessToken: vi.fn(() => null) }));
vi.mock('../../../config', () => ({ config: { apiUrl: 'http://localhost:3000' } }));

import { getCurrentSession, getOrders } from './api';
const mockGetCurrentSession = vi.mocked(getCurrentSession);
const mockGetOrders = vi.mocked(getOrders);

afterEach(() => vi.clearAllMocks());

test('shows loading state initially', () => {
  mockGetCurrentSession.mockReturnValue(new Promise(() => {}));
  render(<OrdersPanel />);
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('shows closed message when no session is active', async () => {
  mockGetCurrentSession.mockResolvedValue({ ok: true, data: null });
  render(<OrdersPanel />);
  await waitFor(() =>
    expect(screen.getByText(/La caja está cerrada/)).toBeInTheDocument(),
  );
});

test('shows error state on API failure', async () => {
  mockGetCurrentSession.mockResolvedValue({ ok: false, error: {}, httpStatus: 403 });
  render(<OrdersPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar')).toBeInTheDocument(),
  );
});

test('shows error state on network exception', async () => {
  mockGetCurrentSession.mockRejectedValue(new Error('Network error'));
  render(<OrdersPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar')).toBeInTheDocument(),
  );
});

test('when session is open, fetches orders with cashShiftId and limit=30', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(mockGetOrders).toHaveBeenCalledWith({ cashShiftId: 'shift-xyz', limit: 30 }),
  );
});

test('when session is open, shows session banner with máx note', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(screen.getByText('máx. 30 pedidos')).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
docker compose exec res-ui pnpm test -- --reporter=verbose OrdersPanel
```

Expected: all 6 tests fail (OrdersPanel does not exist yet).

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "test(ui/orders): add failing tests for OrdersPanel session states"
```

---

## Task 16: Implement OrdersPanel.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, useEffect } from 'react';
import { getAccessToken } from '../../../lib/auth';
import { config } from '../../../config';
import { ORDER_EVENTS } from '../../../lib/sse-events';
import { EyeIcon, EyeOffIcon } from '../../commons/icons';
import {
  getCurrentSession, getOrders, updateOrderStatus, markOrderPaid, cancelOrder,
} from './api';
import type { Order, CurrentSession } from './api';
import type { FilterValues } from './OrderFilterPanel';
import OrdersKanban from './OrdersKanban';
import OrdersFilteredList from './OrdersFilteredList';
import OrderFilterPanel from './OrderFilterPanel';
import CancelOrderModal from './CancelOrderModal';
import { ORDERS_STATUS, type OrdersStatus, type OrderStatus } from './types';

interface ActiveFilter extends FilterValues {
  label: string;
}

export default function OrdersPanel() {
  const [status, setStatus] = useState<OrdersStatus>(ORDERS_STATUS.LOADING);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showSensitive, setShowSensitive] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchOrders(cashShiftId: string, filter: ActiveFilter | null) {
    const params: Parameters<typeof getOrders>[0] = { cashShiftId, limit: 30 };
    if (filter?.orderNumber) params.orderNumber = filter.orderNumber;
    if (filter?.statuses.length === 1) params.status = filter.statuses[0];
    const result = await getOrders(params);
    if (result.ok) setOrders(result.data);
  }

  async function loadSession() {
    setStatus(ORDERS_STATUS.LOADING);
    try {
      const result = await getCurrentSession();
      if (!result.ok) {
        setStatus(ORDERS_STATUS.ERROR);
        return;
      }
      if (!result.data) {
        setStatus(ORDERS_STATUS.CLOSED);
        return;
      }
      setSession(result.data);
      setStatus(ORDERS_STATUS.OPEN);
      await fetchOrders(result.data.id, null);
    } catch {
      setStatus(ORDERS_STATUS.ERROR);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  // SSE: reload orders in kanban mode only (filter mode ignores SSE to avoid clobbering the search)
  useEffect(() => {
    if (status !== ORDERS_STATUS.OPEN || !session) return;
    const token = getAccessToken();
    if (!token) return;
    const es = new EventSource(`${config.apiUrl}/v1/events/dashboard?token=${token}`);
    const reload = () => {
      if (!activeFilter) fetchOrders(session.id, null);
    };
    es.addEventListener(ORDER_EVENTS.NEW, reload);
    es.addEventListener(ORDER_EVENTS.UPDATED, reload);
    return () => es.close();
  }, [status, session, activeFilter]);

  async function handleAdvance(id: string, nextStatus: string) {
    const order = orders.find((o) => o.id === id);
    if (nextStatus === 'COMPLETED' && !order?.isPaid) {
      showToast('El pedido debe estar pagado antes de completarse', true);
      return;
    }
    const result = await updateOrderStatus(id, nextStatus);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al actualizar', true);
      return;
    }
    await fetchOrders(session!.id, activeFilter);
  }

  async function handlePay(id: string) {
    const result = await markOrderPaid(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al marcar pagado', true);
      return;
    }
    showToast('Marcado como pagado');
    await fetchOrders(session!.id, activeFilter);
  }

  async function handleCancelConfirm(id: string, reason: string) {
    const result = await cancelOrder(id, reason);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al cancelar', true);
      return;
    }
    setCancelOrderId(null);
    showToast('Pedido cancelado');
    await fetchOrders(session!.id, activeFilter);
  }

  async function handleReceipt(id: string) {
    const token = getAccessToken();
    const res = await fetch(`${config.apiUrl}/v1/print/receipt/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { showToast('Error al obtener recibo', true); return; }
    const receipt = await res.json();
    const win = window.open('', '_blank', 'width=400,height=600');
    if (win) {
      win.document.write(`
        <html><head><title>Recibo #${receipt.orderNumber}</title>
        <style>body{font-family:monospace;padding:20px;max-width:350px;margin:0 auto}table{width:100%;border-collapse:collapse}td,th{padding:4px 0;text-align:left}th:last-child,td:last-child{text-align:right}.total{border-top:2px solid #000;font-weight:bold;font-size:1.2em}</style>
        </head><body>
        <h2>${receipt.restaurantName}</h2>
        <p>Pedido #${receipt.orderNumber}<br>${receipt.date}</p>
        <table>
          <tr><th>Producto</th><th>Cant</th><th>Subtotal</th></tr>
          ${(receipt.items ?? []).map((i: any) => `<tr><td>${i.productName}</td><td>${i.quantity}</td><td>$${i.subtotal.toFixed(2)}</td></tr>${i.notes ? `<tr><td colspan="3" style="color:#666;font-size:0.9em">${i.notes}</td></tr>` : ''}`).join('')}
        </table>
        <p class="total">Total: $${receipt.totalAmount.toFixed(2)}</p>
        <p>Pago: ${receipt.paymentMethod}</p>
        </body></html>
      `);
      win.document.close();
      win.print();
    }
  }

  async function handleApplyFilter(filters: FilterValues) {
    const hasFilter = filters.orderNumber !== undefined || filters.statuses.length > 0;
    if (!hasFilter) {
      setActiveFilter(null);
      setShowFilterPanel(false);
      if (session) await fetchOrders(session.id, null);
      return;
    }
    const parts: string[] = [];
    if (filters.statuses.length > 0) parts.push(filters.statuses.join(', '));
    if (filters.orderNumber) parts.push(`#${filters.orderNumber}`);
    const filter: ActiveFilter = { ...filters, label: parts.join(' + ') };
    setActiveFilter(filter);
    setShowFilterPanel(false);
    if (session) await fetchOrders(session.id, filter);
  }

  const cardCallbacks = {
    onAdvance: handleAdvance,
    onPay: handlePay,
    onCancel: (id: string) => setCancelOrderId(id),
    onReceipt: handleReceipt,
  };

  if (status === ORDERS_STATUS.LOADING) {
    return <div className="text-slate-400 text-center py-8">Cargando...</div>;
  }
  if (status === ORDERS_STATUS.ERROR) {
    return <div className="text-red-400 text-center py-8">Error al cargar</div>;
  }
  if (status === ORDERS_STATUS.CLOSED) {
    return (
      <div className="text-center space-y-3 py-8">
        <div className="text-4xl">🔒</div>
        <p className="text-slate-600 font-medium">
          La caja está cerrada. Abre una sesión para ver los pedidos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Cocina (KDS)</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-400">Sesión:</span>
        <span className="font-mono text-slate-700 text-xs">
          {showSensitive ? session!.id : '••••••••'}
        </span>
        <span className="text-slate-400">Cajero:</span>
        <span className="font-medium text-slate-700">
          {showSensitive ? (session!.openedByEmail ?? '-') : '••••••••'}
        </span>
        <span className="text-slate-400 text-xs">máx. 30 pedidos</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSensitive((v) => !v)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
            title="Mostrar/ocultar datos sensibles"
          >
            {showSensitive ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            type="button"
            onClick={() => setShowFilterPanel(true)}
            className={`px-3 py-1 text-xs font-medium rounded-lg border cursor-pointer ${
              activeFilter
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Filtrar
          </button>
        </div>
      </div>

      {activeFilter ? (
        <OrdersFilteredList
          orders={orders}
          filterLabel={activeFilter.label}
          {...cardCallbacks}
          onClearFilter={() => handleApplyFilter({ statuses: [] })}
        />
      ) : (
        <OrdersKanban orders={orders} {...cardCallbacks} />
      )}

      {showFilterPanel && (
        <OrderFilterPanel onApply={handleApplyFilter} onClose={() => setShowFilterPanel(false)} />
      )}

      {cancelOrderId && (
        <CancelOrderModal
          orderId={cancelOrderId}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelOrderId(null)}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium ${
            toast.isError ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the tests — verify they pass**

```bash
docker compose exec res-ui pnpm test -- --reporter=verbose OrdersPanel
```

Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx
git commit -m "feat(ui/orders): implement OrdersPanel with session gating, kanban, and filter mode"
```

---

## Task 17: Update orders.astro

**Files:**
- Modify: `apps/ui/src/pages/dash/orders.astro`

- [ ] **Step 1: Replace the entire file content**

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import OrdersPanel from '../../components/dash/orders/OrdersPanel';
---

<DashboardLayout>
  <OrdersPanel client:load />
</DashboardLayout>
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/pages/dash/orders.astro
git commit -m "feat(ui/orders): replace monolithic orders.astro with OrdersPanel React component"
```

---

## Task 18: Run all UI tests and verify

- [ ] **Step 1: Run the full UI test suite**

```bash
docker compose exec res-ui pnpm test
```

Expected: all tests pass (0 failures).

- [ ] **Step 2: Final e2e backend regression check**

```bash
docker compose exec res-api-core pnpm test:e2e
```

Expected: all e2e tests pass.

- [ ] **Step 3: Final backend unit test check**

```bash
docker compose exec res-api-core pnpm test
```

Expected: all pass.

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|---|---|
| `GET /v1/orders` accepts `cashShiftId` param | Tasks 3, 4, 5 |
| `GET /v1/orders` accepts `orderNumber` param | Tasks 3, 4, 5 |
| Limit cap raised 15 → 30 | Task 5 |
| `ParseEnumPipe` for status → 400 on invalid value | Task 5 |
| `ParseIntPipe` for orderNumber | Task 5 |
| E2E tests for cashShiftId, orderNumber, cross-restaurant, limit, invalid status | Task 1 |
| `GET /v1/cash-register/current` accessible by BASIC | Tasks 2, 6 |
| `orders.astro` becomes thin wrapper | Task 17 |
| `OrdersPanel` with 4 session states | Tasks 15, 16 |
| Session banner with masked ID and email | Task 16 |
| máx. 30 pedidos note | Task 16 |
| Kanban: 2-col primary + collapsible secondary | Task 14 |
| Filter mode: flat list when filter active | Tasks 12, 13 |
| Filter panel: order number + status checkboxes | Task 12 |
| SSE reload in kanban mode only | Task 16 |
| Order actions (Procesar, Completar, Marcar Pagado, Cancelar, Recibo) | Task 10 |
| CancelOrderModal extracted from inline | Task 11 |
| `api.ts` typed wrappers | Task 9 |
| `types.ts` shared types | Task 8 |
