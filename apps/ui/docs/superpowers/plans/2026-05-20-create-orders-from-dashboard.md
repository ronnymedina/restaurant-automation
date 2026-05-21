# Create Orders from Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow ADMIN/MANAGER staff to create orders directly from the dashboard using a 2-step modal: product search → order details, bypassing the public kiosk.

**Architecture:** Backend adds `POST /v1/orders` (authenticated) and extends `PATCH /v1/orders/:id/pay` to optionally accept a `paymentMethod`. Frontend adds a Zustand cart store + react-hook-form validated form inside a stepper modal. No DB migrations needed — all fields already exist.

**Tech Stack:** NestJS, Prisma, class-validator (backend) · React, Zustand, react-hook-form, Zod, @tanstack/react-query, Tailwind (frontend)

**Spec:** `apps/ui/docs/superpowers/specs/2026-05-19-create-orders-from-dashboard-design.md`

**Tests run inside Docker:**
```bash
# Unit tests (api-core)
docker compose exec res-api-core pnpm test

# E2E tests (api-core)
docker compose exec res-api-core pnpm test:e2e

# Frontend tests
docker compose exec res-ui pnpm test
```

---

## File Map

### `apps/api-core` — new/modified files

| File | Action | Responsibility |
|---|---|---|
| `src/orders/dto/mark-order-paid.dto.ts` | **Create** | DTO with optional `paymentMethod` enum |
| `src/orders/order.repository.ts` | **Modify** | `markAsPaid` accepts optional `paymentMethod` |
| `src/orders/orders.service.ts` | **Modify** | Add `createStaffOrder`; `markAsPaid` accepts optional `paymentMethod` |
| `src/orders/orders.controller.ts` | **Modify** | Add `POST /v1/orders`; `PATCH /:id/pay` accepts `MarkOrderPaidDto` body |
| `src/orders/orders.service.spec.ts` | **Modify** | Unit tests for `createStaffOrder` and updated `markAsPaid` |
| `test/orders/createOrderFromDashboard.e2e-spec.ts` | **Create** | E2E: POST + updated /pay |
| `src/orders/orders.module.info.md` | **Modify** | Document new endpoint and /pay change |

### `apps/ui` — new/modified files

| File | Action | Responsibility |
|---|---|---|
| `package.json` + `pnpm-lock.yaml` | **Modify** | Add `react-hook-form` + `@hookform/resolvers` |
| `src/components/dash/orders/create-order-api.ts` | **Create** | `searchProducts()` + `createStaffOrder()` |
| `src/components/dash/orders/api.ts` | **Modify** | `markOrderPaid` accepts optional `paymentMethod` |
| `src/components/dash/orders/create-order-store.ts` | **Create** | Zustand cart store |
| `src/components/dash/orders/CreateOrderStep1.tsx` | **Create** | Product search + cart |
| `src/components/dash/orders/CreateOrderStep2.tsx` | **Create** | Order type + customer data form |
| `src/components/dash/orders/CreateOrderModal.tsx` | **Create** | Stepper modal — orchestrates steps 1 & 2 |
| `src/components/dash/orders/OrdersPanel.tsx` | **Modify** | "Nuevo pedido" button + mount modal |

---

## Task 1: MarkOrderPaidDto

**Files:**
- Create: `apps/api-core/src/orders/dto/mark-order-paid.dto.ts`

- [ ] **Create the DTO file**

```typescript
// apps/api-core/src/orders/dto/mark-order-paid.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkOrderPaidDto {
  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;
}
```

- [ ] **Commit**

```bash
git add apps/api-core/src/orders/dto/mark-order-paid.dto.ts
git commit -m "feat(orders): add MarkOrderPaidDto with optional paymentMethod"
```

---

## Task 2: Update OrderRepository.markAsPaid

**Files:**
- Modify: `apps/api-core/src/orders/order.repository.ts`

- [ ] **Update `markAsPaid` to accept optional `paymentMethod`**

Replace the existing `markAsPaid` method (currently at line ~144):

```typescript
async markAsPaid(id: string, paymentMethod?: string) {
  const order = await this.prisma.order.update({
    where: { id },
    data: {
      isPaid: true,
      ...(paymentMethod ? { paymentMethod: paymentMethod as PaymentMethod } : {}),
    },
    include: ORDER_WITH_ITEMS,
  });
  return serializeOrder(order);
}
```

- [ ] **Commit**

```bash
git add apps/api-core/src/orders/order.repository.ts
git commit -m "feat(orders): update markAsPaid repository to accept optional paymentMethod"
```

---

## Task 3: Update OrdersService

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`

- [ ] **Add `createStaffOrder` method** after the existing `createOrder` method:

```typescript
async createStaffOrder(restaurantId: string, dto: CreateOrderDto) {
  const shift = await this.cashShiftRepository.findOpen(restaurantId);
  if (!shift) throw new RegisterNotOpenException();
  return this.createOrder(restaurantId, shift.id, { ...dto, orderSource: 'STAFF' });
}
```

- [ ] **Update `markAsPaid` signature** to accept optional `paymentMethod` and pass it to the repository.

Replace the existing `markAsPaid` method signature and the `this.orderRepository.markAsPaid(id)` call:

```typescript
async markAsPaid(id: string, restaurantId: string, paymentMethod?: string) {
  const order = await this.findById(id, restaurantId);

  if (order.status === OrderStatus.CREATED) {
    await this.orderRepository.updateStatus(id, OrderStatus.CONFIRMED);
  }
  if (order.status === OrderStatus.SERVED) {
    await this.orderRepository.updateStatus(id, OrderStatus.COMPLETED);
  }

  const updatedOrder = await this.orderRepository.markAsPaid(id, paymentMethod);
  this.orderEventsService.emitOrderUpdated(restaurantId, updatedOrder);

  void this.printService.printReceipt(id).catch((err) =>
    this.logger.warn(`Receipt print failed for order ${id}: ${err.message}`),
  );

  if (updatedOrder.customerEmail && this.emailService) {
    try {
      const receipt = await this.printService.generateReceipt(id);
      await this.emailService.sendReceiptEmail(updatedOrder.customerEmail, receipt);
    } catch (error) {
      this.logger.error(`Failed to send receipt email for order ${id}`, error);
    }
  }

  return updatedOrder;
}
```

- [ ] **Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts
git commit -m "feat(orders): add createStaffOrder; markAsPaid accepts optional paymentMethod"
```

---

## Task 4: Unit tests for OrdersService changes

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`

- [ ] **Add tests for `createStaffOrder`**

Add a new `describe` block at the end of the file (before the closing `}`):

```typescript
describe('createStaffOrder', () => {
  it('throws RegisterNotOpenException when no open shift', async () => {
    mockCashShiftRepository.findOpen.mockResolvedValue(null);
    const dto = { items: [], paymentMethod: undefined } as any;
    await expect(service.createStaffOrder('r1', dto)).rejects.toThrow(RegisterNotOpenException);
  });

  it('calls createOrder with orderSource STAFF when shift is open', async () => {
    mockCashShiftRepository.findOpen.mockResolvedValue({ id: 'shift1' });
    mockPrisma.cashShift.update.mockResolvedValue({ lastOrderNumber: 1 });
    mockPrisma.product.findUnique.mockResolvedValue({
      id: 'p1', restaurantId: 'r1', price: BigInt(1000), stock: 10, name: 'Pizza',
    });
    mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    const createdOrder = { id: 'o1', orderNumber: 1, orderSource: 'STAFF', status: 'CONFIRMED', items: [] };
    mockOrderRepository.createWithItems.mockResolvedValue(createdOrder);

    const dto = {
      items: [{ productId: 'p1', quantity: 1 }],
      orderType: 'PICKUP',
    } as any;

    const result = await service.createStaffOrder('r1', dto);
    expect(result.order.orderSource).toBe('STAFF');
    expect(result.order.status).toBe('CONFIRMED');
  });
});
```

- [ ] **Add test for `markAsPaid` with `paymentMethod`**

Add inside the existing `describe('markAsPaid')` block (or create one if it doesn't exist):

```typescript
describe('markAsPaid', () => {
  it('calls repository.markAsPaid with paymentMethod when provided', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED });
    mockOrderRepository.findById.mockResolvedValue(order);
    mockOrderRepository.updateStatus.mockResolvedValue(order);
    const paid = { ...order, isPaid: true, paymentMethod: 'CASH' };
    mockOrderRepository.markAsPaid.mockResolvedValue(paid);

    await service.markAsPaid('o1', 'r1', 'CASH');
    expect(mockOrderRepository.markAsPaid).toHaveBeenCalledWith('o1', 'CASH');
  });

  it('calls repository.markAsPaid without paymentMethod when omitted', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED });
    mockOrderRepository.findById.mockResolvedValue(order);
    mockOrderRepository.updateStatus.mockResolvedValue(order);
    const paid = { ...order, isPaid: true };
    mockOrderRepository.markAsPaid.mockResolvedValue(paid);

    await service.markAsPaid('o1', 'r1');
    expect(mockOrderRepository.markAsPaid).toHaveBeenCalledWith('o1', undefined);
  });
});
```

- [ ] **Run unit tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service.spec
```

Expected: all tests pass (green).

- [ ] **Commit**

```bash
git add apps/api-core/src/orders/orders.service.spec.ts
git commit -m "test(orders): add unit tests for createStaffOrder and updated markAsPaid"
```

---

## Task 5: Update OrdersController

**Files:**
- Modify: `apps/api-core/src/orders/orders.controller.ts`

- [ ] **Add imports** at the top of the file:

```typescript
import { Post, Body } from '@nestjs/common'; // add Post, Body to existing import
import { MarkOrderPaidDto } from './dto/mark-order-paid.dto';
import { CreateOrderDto } from './dto/create-order.dto'; // already imported
```

The existing import line is:
```typescript
import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
```

Replace it with:
```typescript
import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
```

Then add the `MarkOrderPaidDto` import after the existing DTO imports:
```typescript
import { MarkOrderPaidDto } from './dto/mark-order-paid.dto';
```

- [ ] **Add `POST /v1/orders` endpoint** after the `findAll` method and before `findHistory`:

```typescript
@Post()
@ApiOperation({ summary: 'Crear pedido desde el dashboard (STAFF). Roles: ADMIN | MANAGER' })
@ApiResponse({ status: 201, description: 'Pedido creado', type: OrderWithItemsDto })
@ApiResponse({ status: 401, description: 'No autenticado' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
@ApiResponse({ status: 409, description: 'Sin caja abierta o stock insuficiente' })
async createOrder(
  @CurrentUser() user: { restaurantId: string },
  @Body() dto: CreateOrderDto,
) {
  return this.ordersService.createStaffOrder(user.restaurantId, dto);
}
```

- [ ] **Update `markAsPaid` endpoint** to accept the optional body:

Replace the existing `markAsPaid` method:

```typescript
@Patch(':id/pay')
@ApiOperation({ summary: 'Marcar orden como pagada. Acepta paymentMethod opcional.' })
@ApiParam({ name: 'id', description: 'ID de la orden', type: String })
@ApiResponse({ status: 200, description: 'Orden marcada como pagada', type: OrderDto })
@ApiResponse({ status: 404, description: 'Orden no encontrada' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
async markAsPaid(
  @Param('id') id: string,
  @CurrentUser() user: { restaurantId: string },
  @Body() dto: MarkOrderPaidDto,
) {
  return this.ordersService.markAsPaid(id, user.restaurantId, dto.paymentMethod);
}
```

- [ ] **Commit**

```bash
git add apps/api-core/src/orders/orders.controller.ts
git commit -m "feat(orders): add POST /v1/orders (staff); PATCH /pay accepts optional paymentMethod"
```

---

## Task 6: E2E tests

**Files:**
- Create: `apps/api-core/test/orders/createOrderFromDashboard.e2e-spec.ts`

- [ ] **Create the E2E test file**

> **Nota sobre shifts:** El índice único `one_open_shift_per_restaurant` impide tener más de un turno OPEN por restaurante. Por eso cada `describe` abre el shift **una sola vez en `beforeAll`** y lo reutiliza. Para el test "Sin caja abierta → 409" se usa un **restaurante separado** (`CLOSED`) que nunca tiene un turno abierto, evitando así dependencias de orden entre tests.

```typescript
// test/orders/createOrderFromDashboard.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift,
} from './orders.helpers';

describe('POST /v1/orders - createOrderFromDashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let restaurantId: string;
  let categoryId: string;
  let closedAdminToken: string;
  let closedRestaurantId: string;
  let closedCategoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    // Main restaurant — shift opened once, reused by all tests that need it
    const rest = await seedRestaurant(prisma, 'DASH');
    adminToken = await login(app, rest.admin.email);
    managerToken = await login(app, rest.manager.email);
    basicToken = await login(app, rest.basic.email);
    restaurantId = rest.restaurant.id;
    categoryId = rest.category.id;
    await openCashShift(prisma, restaurantId, rest.admin.id);

    // Closed restaurant — intentionally no shift, used only for the 409 test
    const closedRest = await seedRestaurant(prisma, 'CLOSED');
    closedAdminToken = await login(app, closedRest.admin.email);
    closedRestaurantId = closedRest.restaurant.id;
    closedCategoryId = closedRest.category.id;
  });

  afterAll(async () => { await app.close(); });

  it('Sin token → 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .send({ items: [], orderType: 'PICKUP' })
      .expect(401);
  });

  it('BASIC → 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${basicToken}`)
      .send({ items: [], orderType: 'PICKUP' })
      .expect(403);
  });

  it('Sin caja abierta → 409 REGISTER_NOT_OPEN', async () => {
    const product = await seedProduct(prisma, closedRestaurantId, closedCategoryId);
    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${closedAdminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(409);
  });

  it('ADMIN crea pedido → 201, status CONFIRMED, orderSource STAFF', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const res = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(201);

    expect(res.body.order.status).toBe('CONFIRMED');
    expect(res.body.order.orderSource).toBe('STAFF');
    expect(res.body.order.orderNumber).toBeGreaterThan(0);
  });

  it('MANAGER crea pedido → 201', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const res = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(201);

    expect(res.body.order.orderSource).toBe('STAFF');
  });

  it('DELIVERY sin deliveryAddress → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'DELIVERY',
      })
      .expect(400);
  });

  it('Producto sin stock → 409', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId, { stock: 0 });

    await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
      })
      .expect(409);
  });

  it('orderSource del body es ignorado — siempre queda STAFF', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const res = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        orderType: 'PICKUP',
        orderSource: 'KIOSK', // intento de sobrescribir — debe ignorarse
      })
      .expect(201);

    expect(res.body.order.orderSource).toBe('STAFF');
  });
});

describe('PATCH /v1/orders/:id/pay con paymentMethod (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let restaurantId: string;
  let categoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    const rest = await seedRestaurant(prisma, 'PAY');
    adminToken = await login(app, rest.admin.email);
    restaurantId = rest.restaurant.id;
    categoryId = rest.category.id;
    // Open shift once — reused by all tests in this describe
    await openCashShift(prisma, restaurantId, rest.admin.id);
  });

  afterAll(async () => { await app.close(); });

  it('/pay sin body → 200, paymentMethod sigue null', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const created = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], orderType: 'PICKUP' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${created.body.order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.isPaid).toBe(true);
    expect(res.body.paymentMethod).toBeNull();
  });

  it('/pay con paymentMethod: CASH → 200, paymentMethod guardado', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const created = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], orderType: 'PICKUP' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/orders/${created.body.order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: 'CASH' })
      .expect(200);

    expect(res.body.isPaid).toBe(true);
    expect(res.body.paymentMethod).toBe('CASH');
  });

  it('/pay con valor inválido → 400', async () => {
    const product = await seedProduct(prisma, restaurantId, categoryId);

    const created = await request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], orderType: 'PICKUP' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/orders/${created.body.order.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: 'BITCOIN' })
      .expect(400);
  });
});
```

- [ ] **Run E2E tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=createOrderFromDashboard
```

Expected: all tests pass (green).

- [ ] **Commit**

```bash
git add test/orders/createOrderFromDashboard.e2e-spec.ts
git commit -m "test(orders): add e2e tests for POST /v1/orders and /pay with paymentMethod"
```

---

## Task 7: Update orders.module.info.md

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md`

- [ ] **Add `POST /v1/orders` to the endpoints table**

Find the `### Endpoints` table and add the new row:

```markdown
| `POST` | `/v1/orders` | ADMIN, MANAGER | `{ order, receipt, kitchenTicket }` (201) | Crear pedido desde el dashboard (orderSource: STAFF) |
```

- [ ] **Update `PATCH /:id/pay` row** in the table to note the new optional body:

```markdown
| `PATCH` | `/v1/orders/:id/pay` | ADMIN, MANAGER | `OrderDto` | Marcar orden como pagada. Body opcional: `{ paymentMethod? }` |
```

- [ ] **Update `OrderDto` response** to include the new fields from develop:

In the `OrderDto` JSON example, add after `"customerEmail"`:
```json
"customerName": "string | null",
"customerPhone": "string | null",
"deliveryAddress": "string | null",
"deliveryReferences": "string | null",
```

- [ ] **Update the implementation note** that says "La creación de órdenes la realiza el módulo `kiosk`":

Replace:
```
- La creación de órdenes la realiza el módulo `kiosk` vía `POST /v1/kiosk/:slug/orders` — el controller de `orders` no expone `POST`
```
With:
```
- La creación de órdenes puede realizarse desde el kiosk (`POST /v1/kiosk/:slug/orders`, público) o desde el dashboard (`POST /v1/orders`, autenticado ADMIN/MANAGER). Los pedidos de staff usan `orderSource: 'STAFF'` (forzado en el servicio) e inician en estado `CONFIRMED`
```

- [ ] **Add E2E test reference** for the new endpoint below the existing E2E references:

```
E2E: ✅ `test/orders/createOrderFromDashboard.e2e-spec.ts`
```

- [ ] **Commit**

```bash
git add apps/api-core/src/orders/orders.module.info.md
git commit -m "docs(orders): update module.info with POST /v1/orders and /pay paymentMethod"
```

---

## Task 8: Install frontend dependencies

- [ ] **Install inside the container**

```bash
docker compose exec res-ui pnpm add react-hook-form @hookform/resolvers
```

Expected output: packages added, `pnpm-lock.yaml` updated inside container.

- [ ] **Copy updated lock file to local**

```bash
docker compose cp res-ui:/app/pnpm-lock.yaml apps/ui/pnpm-lock.yaml
```

- [ ] **Verify package.json was updated inside container, then sync it**

```bash
docker compose exec res-ui cat package.json | grep -E "react-hook-form|hookform"
docker compose cp res-ui:/app/package.json apps/ui/package.json
```

Expected: both `react-hook-form` and `@hookform/resolvers` appear in dependencies.

- [ ] **Commit**

```bash
git add apps/ui/package.json apps/ui/pnpm-lock.yaml
git commit -m "deps(ui): add react-hook-form and @hookform/resolvers"
```

---

## Task 9: create-order-api.ts + update api.ts

**Files:**
- Create: `apps/ui/src/components/dash/orders/create-order-api.ts`
- Modify: `apps/ui/src/components/dash/orders/api.ts`

- [ ] **Create `create-order-api.ts`**

```typescript
// apps/ui/src/components/dash/orders/create-order-api.ts
import { apiFetch } from '../../../lib/api';

export interface ProductSearchResult {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  imageUrl: string | null;
  active: boolean;
}

interface ApiError { message?: string; code?: string; }
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; httpStatus: number };

export async function searchProducts(search: string, limit = 20): Promise<ApiResult<ProductSearchResult[]>> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  const res = await apiFetch(`/v1/products?${query}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  return { ok: true, data: data.data as ProductSearchResult[] };
}

export interface CreateStaffOrderPayload {
  items: { productId: string; quantity: number }[];
  orderType: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryReferences?: string;
}

export interface CreatedOrderResult {
  order: { id: string; orderNumber: number; status: string; orderSource: string };
  receipt: null;
  kitchenTicket: null;
}

export async function createStaffOrder(payload: CreateStaffOrderPayload): Promise<ApiResult<CreatedOrderResult>> {
  const res = await apiFetch('/v1/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Update `markOrderPaid` in `api.ts`** to accept optional `paymentMethod`

Find the existing `markOrderPaid` function and replace it:

```typescript
export async function markOrderPaid(id: string, paymentMethod?: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/pay`, {
    method: 'PATCH',
    ...(paymentMethod ? { body: JSON.stringify({ paymentMethod }) } : {}),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Commit**

```bash
git add apps/ui/src/components/dash/orders/create-order-api.ts \
        apps/ui/src/components/dash/orders/api.ts
git commit -m "feat(ui): add create-order-api; update markOrderPaid to accept paymentMethod"
```

---

## Task 10: create-order-store.ts + unit tests

**Files:**
- Create: `apps/ui/src/components/dash/orders/create-order-store.ts`

- [ ] **Create the Zustand store**

```typescript
// apps/ui/src/components/dash/orders/create-order-store.ts
import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
}

interface CreateOrderStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  reset: () => void;
}

export const useCreateOrderStore = create<CreateOrderStore>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      }
      return { items: [...state.items, { ...item, quantity: 1 }] };
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { items: state.items.filter((i) => i.productId !== productId) };
      return { items: state.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)) };
    }),

  reset: () => set({ items: [] }),
}));

export const selectTotal = (state: CreateOrderStore) =>
  state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

export const selectItemCount = (state: CreateOrderStore) =>
  state.items.reduce((sum, i) => sum + i.quantity, 0);
```

- [ ] **Write unit tests**

Create `apps/ui/src/components/dash/orders/create-order-store.test.ts`:

```typescript
import { act } from 'react';
import { useCreateOrderStore, selectTotal } from './create-order-store';

const item1 = { productId: 'p1', name: 'Pizza', price: 10, imageUrl: null };
const item2 = { productId: 'p2', name: 'Soda', price: 3, imageUrl: null };

beforeEach(() => {
  act(() => { useCreateOrderStore.getState().reset(); });
});

describe('addItem', () => {
  it('adds a new item with quantity 1', () => {
    act(() => { useCreateOrderStore.getState().addItem(item1); });
    const { items } = useCreateOrderStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
  });

  it('increments quantity if product already in cart', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().addItem(item1);
    });
    expect(useCreateOrderStore.getState().items[0].quantity).toBe(2);
  });

  it('adds multiple different products', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().addItem(item2);
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(2);
  });
});

describe('removeItem', () => {
  it('removes product from cart', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().removeItem('p1');
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(0);
  });
});

describe('updateQuantity', () => {
  it('updates quantity', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().updateQuantity('p1', 5);
    });
    expect(useCreateOrderStore.getState().items[0].quantity).toBe(5);
  });

  it('removes item when quantity set to 0', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().updateQuantity('p1', 0);
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(0);
  });
});

describe('selectTotal', () => {
  it('calculates total correctly', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().addItem(item2);
      useCreateOrderStore.getState().updateQuantity('p1', 2);
    });
    expect(selectTotal(useCreateOrderStore.getState())).toBe(23); // 2*10 + 1*3
  });
});

describe('reset', () => {
  it('clears all items', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().reset();
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(0);
  });
});
```

- [ ] **Run store tests**

```bash
docker compose exec res-ui pnpm test -- --testPathPattern=create-order-store
```

Expected: all tests pass (green).

- [ ] **Commit**

```bash
git add apps/ui/src/components/dash/orders/create-order-store.ts \
        apps/ui/src/components/dash/orders/create-order-store.test.ts
git commit -m "feat(ui): add create-order-store Zustand cart with unit tests"
```

---

## Task 11: CreateOrderStep1.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/CreateOrderStep1.tsx`

- [ ] **Create the component**

```typescript
// apps/ui/src/components/dash/orders/CreateOrderStep1.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreateOrderStore, selectTotal } from './create-order-store';
import { searchProducts, type ProductSearchResult } from './create-order-api';

interface Props {
  onNext: () => void;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ProductCard({ product, onAdd }: { product: ProductSearchResult; onAdd: () => void }) {
  const isOutOfStock = product.stock !== null && product.stock === 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} className="w-full h-24 object-cover rounded-lg" />
      ) : (
        <div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">Sin imagen</div>
      )}
      <div className="flex-1">
        <p className="font-medium text-slate-800 text-sm leading-tight">{product.name}</p>
        <p className="text-slate-500 text-xs mt-0.5">${(product.price / 100).toFixed(2)}</p>
      </div>
      {isOutOfStock ? (
        <span className="text-center text-xs bg-red-100 text-red-600 rounded-lg py-1 font-medium">Agotado</span>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="w-full text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-1.5 cursor-pointer"
        >
          + Agregar
        </button>
      )}
    </div>
  );
}

export default function CreateOrderStep1({ onNext }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { items, addItem, removeItem, updateQuantity } = useCreateOrderStore();
  const total = useCreateOrderStore(selectTotal);

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['staff-products', debouncedSearch],
    queryFn: async () => {
      const result = await searchProducts(debouncedSearch);
      return result.ok ? result.data : [];
    },
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto..."
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {isFetching && <p className="text-slate-400 text-xs text-center">Buscando...</p>}

      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-64">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAdd={() => addItem({ productId: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl })}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carrito</p>
          {items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 text-sm">
              <span className="flex-1 text-slate-800 truncate">{item.name}</span>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                className="w-14 border border-slate-300 rounded-lg px-2 py-1 text-center text-sm"
              />
              <span className="w-16 text-right text-slate-700">${((item.price * item.quantity) / 100).toFixed(2)}</span>
              <button
                type="button"
                onClick={() => removeItem(item.productId)}
                className="text-slate-400 hover:text-red-500 cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-100">
            <span>Total</span>
            <span>${(total / 100).toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onNext}
          disabled={items.length === 0}
          className="w-full py-2.5 rounded-xl font-semibold text-sm cursor-pointer bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
```

> **Nota sobre precios:** `product.price` viene del backend en centavos (BigInt serializado a number). Dividir por 100 para mostrar en pesos. El carrito almacena el precio en centavos para que `total` sea consistente con lo que se envía a la API.

- [ ] **Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderStep1.tsx
git commit -m "feat(ui): add CreateOrderStep1 — product search and cart"
```

---

## Task 12: CreateOrderStep2.tsx

**Files:**
- Create: `apps/ui/src/components/dash/orders/CreateOrderStep2.tsx`

- [ ] **Create the component**

```typescript
// apps/ui/src/components/dash/orders/CreateOrderStep2.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateOrderStore, selectTotal } from './create-order-store';

const step2Schema = z.object({
  orderType: z.enum(['PICKUP', 'DINE_IN', 'DELIVERY']),
  tableNumber: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  deliveryAddress: z.string().optional(),
  deliveryReferences: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.orderType === 'DINE_IN' && !data.tableNumber?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['tableNumber'], message: 'Número de mesa requerido' });
  }
  if (data.orderType === 'DELIVERY' && !data.deliveryAddress?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'Dirección requerida' });
  }
});

export type Step2Values = z.infer<typeof step2Schema>;

interface Props {
  onBack: () => void;
  onSubmit: (values: Step2Values) => void;
  isSubmitting: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

export default function CreateOrderStep2({ onBack, onSubmit, isSubmitting }: Props) {
  const items = useCreateOrderStore((s) => s.items);
  const total = useCreateOrderStore(selectTotal);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { orderType: 'PICKUP' },
  });

  const orderType = watch('orderType');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Order type selector */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo de entrega</label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {(['PICKUP', 'DINE_IN', 'DELIVERY'] as const).map((type) => {
            const labels = { PICKUP: 'Para llevar', DINE_IN: 'En mesa', DELIVERY: 'Delivery' };
            return (
              <label
                key={type}
                className={`cursor-pointer text-center text-sm rounded-xl border px-2 py-2 transition-colors ${
                  orderType === type
                    ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400'
                }`}
              >
                <input type="radio" value={type} {...register('orderType')} className="sr-only" />
                {labels[type]}
              </label>
            );
          })}
        </div>
      </div>

      {/* DINE_IN: mesa */}
      {orderType === 'DINE_IN' && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Número de mesa *</label>
          <input
            {...register('tableNumber')}
            placeholder="Ej: 5"
            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FieldError message={errors.tableNumber?.message} />
        </div>
      )}

      {/* Customer fields — always visible */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre del cliente</label>
        <input
          {...register('customerName')}
          placeholder="Opcional"
          className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Teléfono</label>
        <input
          {...register('customerPhone')}
          placeholder="Opcional"
          className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* DELIVERY: address */}
      {orderType === 'DELIVERY' && (
        <>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dirección *</label>
            <input
              {...register('deliveryAddress')}
              placeholder="Calle, número, colonia"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FieldError message={errors.deliveryAddress?.message} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Referencias</label>
            <input
              {...register('deliveryReferences')}
              placeholder="Opcional"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {/* Order summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resumen</p>
        {items.map((item) => (
          <div key={item.productId} className="flex justify-between text-slate-700">
            <span>{item.name} × {item.quantity}</span>
            <span>${((item.price * item.quantity) / 100).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-slate-800 mt-2 pt-2 border-t border-slate-200">
          <span>Total</span>
          <span>${(total / 100).toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm cursor-pointer hover:bg-slate-50 disabled:opacity-40"
        >
          ← Volver
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creando...' : 'Confirmar pedido'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderStep2.tsx
git commit -m "feat(ui): add CreateOrderStep2 — order type and customer data form"
```

---

## Task 13: CreateOrderModal.tsx + OrdersPanel integration

**Files:**
- Create: `apps/ui/src/components/dash/orders/CreateOrderModal.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

- [ ] **Create `CreateOrderModal.tsx`**

```typescript
// apps/ui/src/components/dash/orders/CreateOrderModal.tsx
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import { useCreateOrderStore } from './create-order-store';
import { createStaffOrder } from './create-order-api';
import CreateOrderStep1 from './CreateOrderStep1';
import CreateOrderStep2, { type Step2Values } from './CreateOrderStep2';

interface Props {
  onClose: () => void;
  onCreated: (orderNumber: number) => void;
}

function ModalContent({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { items, reset } = useCreateOrderStore();

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm(formValues: Step2Values) {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderType: formValues.orderType,
        ...(formValues.tableNumber?.trim() ? { tableNumber: formValues.tableNumber.trim() } : {}),
        ...(formValues.customerName?.trim() ? { customerName: formValues.customerName.trim() } : {}),
        ...(formValues.customerPhone?.trim() ? { customerPhone: formValues.customerPhone.trim() } : {}),
        ...(formValues.customerEmail?.trim() ? { customerEmail: formValues.customerEmail.trim() } : {}),
        ...(formValues.deliveryAddress?.trim() ? { deliveryAddress: formValues.deliveryAddress.trim() } : {}),
        ...(formValues.deliveryReferences?.trim() ? { deliveryReferences: formValues.deliveryReferences.trim() } : {}),
      };

      const result = await createStaffOrder(payload);
      if (!result.ok) {
        setErrorMsg(result.error.message ?? 'Error al crear el pedido');
        return;
      }
      reset();
      onCreated(result.data.order.orderNumber);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Nuevo pedido</h2>
          <div className="flex items-center gap-4">
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>1</span>
              <span className="text-slate-400">—</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>2</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {errorMsg && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">
              {errorMsg}
            </div>
          )}

          {step === 1 && <CreateOrderStep1 onNext={() => setStep(2)} />}
          {step === 2 && (
            <CreateOrderStep2
              onBack={() => setStep(1)}
              onSubmit={handleConfirm}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateOrderModal({ onClose, onCreated }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ModalContent onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>
  );
}
```

- [ ] **Update `OrdersPanel.tsx`** to add the "Nuevo pedido" button and mount the modal

Add the import at the top of `OrdersPanel.tsx`:
```typescript
import CreateOrderModal from './CreateOrderModal';
```

Add state for the modal inside `OrdersPanel` component, after the existing state declarations:
```typescript
const [showCreateModal, setShowCreateModal] = useState(false);
```

In the `return` JSX, find the header row that contains the `h2` and the filter/eye button area:
```tsx
<div className="flex items-center justify-between">
  <h2 className="text-2xl font-bold text-slate-800">Cocina (KDS)</h2>
</div>
```

Replace it with:
```tsx
<div className="flex items-center justify-between">
  <h2 className="text-2xl font-bold text-slate-800">Cocina (KDS)</h2>
  <button
    type="button"
    onClick={() => setShowCreateModal(true)}
    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
  >
    + Nuevo pedido
  </button>
</div>
```

Add the modal at the bottom of the component return, before the closing `</div>`, after the existing modals:

```tsx
{showCreateModal && (
  <CreateOrderModal
    onClose={() => setShowCreateModal(false)}
    onCreated={(orderNumber) => {
      setShowCreateModal(false);
      showToast(`Pedido #${orderNumber} creado`);
      fetchOrders(activeFilter);
    }}
  />
)}
```

- [ ] **Run frontend tests to verify nothing is broken**

```bash
docker compose exec res-ui pnpm test
```

Expected: all existing tests pass (green). No regressions.

- [ ] **Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderModal.tsx \
        apps/ui/src/components/dash/orders/OrdersPanel.tsx
git commit -m "feat(ui): add CreateOrderModal and integrate into OrdersPanel"
```

---

## Task 14: Run full test suite + verify manually

- [ ] **Run all backend tests**

```bash
docker compose exec res-api-core pnpm test
docker compose exec res-api-core pnpm test:e2e
```

Expected: all suites green.

- [ ] **Run all frontend tests**

```bash
docker compose exec res-ui pnpm test
```

Expected: all suites green.

- [ ] **Manual smoke test** (requires Docker running with a seeded restaurant)

1. Open dashboard → go to Orders page
2. Open a cash shift if not already open
3. Click "Nuevo pedido" — modal opens showing Paso 1
4. Type a product name in the search box — cards appear
5. Click "+ Agregar" — product appears in cart below
6. Add a second product — cart shows both items with subtotal
7. Click "Siguiente →" — Paso 2 appears
8. Select "En mesa", leave table number empty → "Confirmar pedido" shows error "Número de mesa requerido"
9. Fill in table number → submit — toast "Pedido #N creado" appears, modal closes, order appears in kanban as CONFIRMED
10. Click Pay on the order → order is marked paid, verify in DB that `paymentMethod` is null
11. Repeat steps 3-9, this time verify `/pay` call includes `{ paymentMethod: 'CASH' }` from the OrdersPanel pay flow (if you've wired it — otherwise verify it's backward compatible and still works without the field)

- [ ] **Final commit (if any cleanup needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "chore: cleanup after create-orders-from-dashboard feature"
```

---

## Task 15: Update kiosk.module.info.md

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.module.info.md`

The kiosk order creation response now includes customer data fields (`customerName`, `customerPhone`, `deliveryAddress`, `deliveryReferences`) that were merged from develop. Update the JSON example so the module info reflects the actual response shape.

- [ ] **Find the `OrderWithItemsDto` JSON example** in the kiosk module info (likely under the `POST /:slug/orders` endpoint docs) and add the missing customer fields after `"customerEmail"`:

```json
"customerName": "string | null",
"customerPhone": "string | null",
"deliveryAddress": "string | null",
"deliveryReferences": "string | null",
```

- [ ] **Commit**

```bash
git add apps/api-core/src/kiosk/kiosk.module.info.md
git commit -m "docs(kiosk): update module.info with customer data fields in order response"
```
