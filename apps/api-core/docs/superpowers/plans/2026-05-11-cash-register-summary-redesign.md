# Cash Register Summary Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `closeSession` and `getSessionSummary` to only count COMPLETED orders in totals, redesign the summary response shape, extract top-products to a dedicated endpoint, add proper serializers with `fromCents()`, and update frontend types.

**Architecture:** Service changes first (queries + response shape), then serializer, then controller route, then DTO types, then frontend, then e2e tests, finally docs. Each task is independently committable. Unit tests are updated in the same task as the code they test.

**Tech Stack:** NestJS, Prisma (PostgreSQL), `class-transformer` (`@Expose`/`@Exclude`/`@Transform`), `fromCents()` from `src/common/helpers/money.ts`, TypeScript, supertest e2e.

---

## File Map

| File | Action |
|------|--------|
| `src/cash-register/cash-register.service.ts` | Modify: fix `closeSession` filter, redesign `getSessionSummary`, add `getTopProducts` |
| `src/cash-register/cash-register.service.spec.ts` | Modify: update existing tests + add new tests for new behavior |
| `src/cash-register/cash-register.controller.ts` | Modify: add `GET top-products/:sessionId` route, use serializers for summary responses |
| `src/cash-register/dto/cash-register-response.dto.ts` | Modify: replace `SessionSummaryDto`, add `OrderStatusGroupDto`, add `TopProductsResponseDto` |
| `src/cash-register/serializers/cash-shift.serializer.ts` | Modify: change `totalSales` and `openingBalance` `@Transform` to use `fromCents()` |
| `src/cash-register/serializers/session-summary.serializer.ts` | Create: serializer classes for summary + top-products responses |
| `apps/ui/src/components/dash/register/api.ts` | Modify: update `SessionDetailSummary`, add `getTopProducts` function |
| `test/cash-register/sessionSummary.e2e-spec.ts` | Modify: replace all tests with new response shape assertions |
| `test/cash-register/closeSession.e2e-spec.ts` | Modify: add test that `totalSales` excludes CANCELLED orders |
| `test/cash-register/topProducts.e2e-spec.ts` | Create: e2e tests for the new `GET /top-products/:sessionId` endpoint |
| `src/cash-register/cash-register.module.info.md` | Modify: update examples, endpoint table, e2e section, implementation notes |

---

### Task 1: Fix `closeSession` — filter COMPLETED only

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts`

- [ ] **Step 1: Write a failing unit test — `totalSales` excludes CANCELLED orders**

Add this test inside the existing `describe('closeSession', ...)` block in `cash-register.service.spec.ts`:

```ts
it('should query only COMPLETED orders for aggregate and groupBy', async () => {
  const session = mockSession();
  const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

  mockTx.cashShift.findFirst.mockResolvedValue(session);
  mockTx.order.aggregate.mockResolvedValue({
    _sum: { totalAmount: 200n },
    _count: { id: 2 },
  });
  mockTx.order.groupBy.mockResolvedValue([]);
  mockTx.cashShift.update.mockResolvedValue(closedSession);

  await service.closeSession('restaurant-uuid-1');

  expect(mockTx.order.aggregate).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ status: 'COMPLETED' }),
    }),
  );
  expect(mockTx.order.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ status: 'COMPLETED' }),
    }),
  );
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose exec res-api-core pnpm test --testPathPattern="cash-register.service"
```

Expected: FAIL — the current queries have no `status` filter.

- [ ] **Step 3: Fix `closeSession` in `cash-register.service.ts`**

Replace the `[agg, paymentGroups]` parallel queries (lines 58–70) with:

```ts
const [agg, paymentGroups] = await Promise.all([
  tx.order.aggregate({
    where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
    _sum: { totalAmount: true },
    _count: { id: true },
  }),
  tx.order.groupBy({
    by: ['paymentMethod'],
    where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
    _sum: { totalAmount: true },
    _count: { id: true },
  }),
]);
```

Also replace the `null` fallback key from `'SIN_METODO'` to `'UNKNOWN'` to match the existing test at line 265 in the spec:

```ts
const method = group.paymentMethod ?? 'UNKNOWN';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
docker compose exec res-api-core pnpm test --testPathPattern="cash-register.service"
```

Expected: all `closeSession` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.service.spec.ts
git commit -m "fix(cash-register): closeSession queries only COMPLETED orders for totalSales"
```

---

### Task 2: Redesign `getSessionSummary` — groupBy on status, remove topProducts

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts`

- [ ] **Step 1: Write failing unit tests for new response shape**

Replace all tests inside `describe('getSessionSummary', ...)` in the spec file with the following. Delete the old describe block contents and paste:

```ts
describe('getSessionSummary', () => {
  it('should throw CashRegisterNotFoundException when session not found', async () => {
    mockRegisterSessionRepository.findById.mockResolvedValue(null);

    await expect(
      service.getSessionSummary('nonexistent-session-id'),
    ).rejects.toThrow(CashRegisterNotFoundException);

    expect(mockOrderRepository.findBySessionId).not.toHaveBeenCalled();
  });

  it('should return session, summary, and orders', async () => {
    const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.$queryRaw = jest.fn(); // not used
    mockPrismaService.order = {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'COMPLETED', _sum: { totalAmount: 200n }, _count: { id: 2 } },
        { status: 'CANCELLED', _sum: { totalAmount: 50n }, _count: { id: 1 } },
      ]),
    } as any;
    mockOrderRepository.findBySessionId.mockResolvedValue([]);

    const result = await service.getSessionSummary('session-uuid-1');

    expect(result.session).toEqual(session);
    expect(Array.isArray(result.orders)).toBe(true);
    expect(result.summary).toBeDefined();
  });

  it('should build ordersByStatus with count and total for each status', async () => {
    const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.order = {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'COMPLETED', _sum: { totalAmount: 200n }, _count: { id: 2 } },
        { status: 'CANCELLED', _sum: { totalAmount: 50n }, _count: { id: 1 } },
        { status: 'CREATED',   _sum: { totalAmount: 30n },  _count: { id: 1 } },
      ]),
    } as any;
    mockOrderRepository.findBySessionId.mockResolvedValue([]);

    const result = await service.getSessionSummary('session-uuid-1');

    expect(result.summary.ordersByStatus.COMPLETED).toEqual({ count: 2, total: 200n });
    expect(result.summary.ordersByStatus.CANCELLED).toEqual({ count: 1, total: 50n });
    expect(result.summary.ordersByStatus.CREATED).toEqual({ count: 1, total: 30n });
    expect(result.summary.ordersByStatus.PROCESSING).toEqual({ count: 0, total: 0n });
  });

  it('should compute totalSales as sum of CREATED + PROCESSING + COMPLETED (excludes CANCELLED)', async () => {
    const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.order = {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'COMPLETED',  _sum: { totalAmount: 200n }, _count: { id: 2 } },
        { status: 'CANCELLED',  _sum: { totalAmount: 50n },  _count: { id: 1 } },
        { status: 'CREATED',    _sum: { totalAmount: 30n },  _count: { id: 1 } },
        { status: 'PROCESSING', _sum: { totalAmount: 10n },  _count: { id: 1 } },
      ]),
    } as any;
    mockOrderRepository.findBySessionId.mockResolvedValue([]);

    const result = await service.getSessionSummary('session-uuid-1');

    // 200 + 30 + 10 = 240 (centavos BigInt)
    expect(result.summary.totalSales).toBe(240n);
    expect(result.summary.totalOrders).toBe(5);
  });

  it('should compute paymentBreakdown from COMPLETED orders only via second groupBy', async () => {
    const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.order = {
      groupBy: jest.fn()
        .mockResolvedValueOnce([
          { status: 'COMPLETED', _sum: { totalAmount: 200n }, _count: { id: 2 } },
        ])
        .mockResolvedValueOnce([
          { paymentMethod: 'CASH', _sum: { totalAmount: 150n }, _count: { id: 1 } },
          { paymentMethod: 'CARD', _sum: { totalAmount: 50n },  _count: { id: 1 } },
        ]),
    } as any;
    mockOrderRepository.findBySessionId.mockResolvedValue([]);

    const result = await service.getSessionSummary('session-uuid-1');

    expect(result.summary.paymentBreakdown).toEqual({
      CASH: { count: 1, total: 150n },
      CARD: { count: 1, total: 50n  },
    });
  });

  it('should not include topProducts in summary', async () => {
    const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.order = {
      groupBy: jest.fn().mockResolvedValue([]),
    } as any;
    mockOrderRepository.findBySessionId.mockResolvedValue([]);

    const result = await service.getSessionSummary('session-uuid-1');

    expect((result.summary as any).topProducts).toBeUndefined();
    expect((result.summary as any).completedOrders).toBeUndefined();
    expect((result.summary as any).cancelledOrders).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
docker compose exec res-api-core pnpm test --testPathPattern="cash-register.service"
```

Expected: new tests FAIL, old ones may still pass (they'll be deleted by the replacement).

- [ ] **Step 3: Rewrite `getSessionSummary` in `cash-register.service.ts`**

Replace the entire `getSessionSummary` method (lines 139–203) with:

```ts
async getSessionSummary(sessionId: string) {
  const session = await this.registerSessionRepository.findById(sessionId);
  if (!session) throw new CashRegisterNotFoundException(sessionId);

  const [statusGroups, paymentGroups, orders] = await Promise.all([
    this.prisma.order.groupBy({
      by: ['status'],
      where: { cashShiftId: session.id },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    this.prisma.order.groupBy({
      by: ['paymentMethod'],
      where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    this.orderRepository.findBySessionId(sessionId, session.restaurantId),
  ]);

  const allStatuses: OrderStatus[] = [
    OrderStatus.CREATED,
    OrderStatus.PROCESSING,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
  ];

  const ordersByStatus = Object.fromEntries(
    allStatuses.map((s) => {
      const g = statusGroups.find((r) => r.status === s);
      return [s, { count: g?._count.id ?? 0, total: g?._sum.totalAmount ?? 0n }];
    }),
  ) as Record<OrderStatus, { count: number; total: bigint }>;

  const totalSales =
    (ordersByStatus[OrderStatus.CREATED].total ?? 0n) +
    (ordersByStatus[OrderStatus.PROCESSING].total ?? 0n) +
    (ordersByStatus[OrderStatus.COMPLETED].total ?? 0n);

  const totalOrders = statusGroups.reduce((sum, g) => sum + g._count.id, 0);

  const paymentBreakdown: Record<string, { count: number; total: bigint }> = {};
  for (const g of paymentGroups) {
    const method = g.paymentMethod ?? 'UNKNOWN';
    paymentBreakdown[method] = {
      count: g._count.id,
      total: g._sum.totalAmount ?? 0n,
    };
  }

  return {
    session,
    summary: {
      ordersByStatus,
      totalSales,
      totalOrders,
      paymentBreakdown,
    },
    orders,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
docker compose exec res-api-core pnpm test --testPathPattern="cash-register.service"
```

Expected: all tests in `getSessionSummary` describe block pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.service.spec.ts
git commit -m "feat(cash-register): redesign getSessionSummary with ordersByStatus groupBy"
```

---

### Task 3: Add `getTopProducts` service method

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts`

- [ ] **Step 1: Write failing unit tests for `getTopProducts`**

Add a new `describe('getTopProducts', ...)` block at the end of the test file:

```ts
describe('getTopProducts', () => {
  it('should throw CashRegisterNotFoundException when session not found', async () => {
    mockRegisterSessionRepository.findById.mockResolvedValue(null);

    await expect(
      service.getTopProducts('nonexistent-id'),
    ).rejects.toThrow(CashRegisterNotFoundException);
  });

  it('should return top 5 products sorted by quantity, excluding CANCELLED orders', async () => {
    const session = mockSession({ status: 'CLOSED' });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.orderItem.groupBy.mockResolvedValue([
      { productId: 'prod-1', _sum: { quantity: 10, subtotal: 1000n } },
      { productId: 'prod-2', _sum: { quantity: 5,  subtotal: 500n  } },
    ]);
    mockPrismaService.product.findMany.mockResolvedValue([
      { id: 'prod-1', name: 'Burger' },
      { id: 'prod-2', name: 'Fries'  },
    ]);

    const result = await service.getTopProducts('session-uuid-1');

    expect(result.topProducts).toHaveLength(2);
    expect(result.topProducts[0]).toEqual({ id: 'prod-1', name: 'Burger', quantity: 10, total: 1000n });
    expect(result.topProducts[1]).toEqual({ id: 'prod-2', name: 'Fries',  quantity: 5,  total: 500n  });
  });

  it('should call orderItem.groupBy with status { not: CANCELLED } filter', async () => {
    const session = mockSession({ status: 'CLOSED' });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.orderItem.groupBy.mockResolvedValue([]);
    mockPrismaService.product.findMany.mockResolvedValue([]);

    await service.getTopProducts('session-uuid-1');

    expect(mockPrismaService.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({
            status: { not: OrderStatus.CANCELLED },
          }),
        }),
      }),
    );
  });

  it('should use fallback name "Producto" when product not found', async () => {
    const session = mockSession({ status: 'CLOSED' });
    mockRegisterSessionRepository.findById.mockResolvedValue(session);
    mockPrismaService.orderItem.groupBy.mockResolvedValue([
      { productId: 'orphan-id', _sum: { quantity: 1, subtotal: 100n } },
    ]);
    mockPrismaService.product.findMany.mockResolvedValue([]);

    const result = await service.getTopProducts('session-uuid-1');

    expect(result.topProducts[0].name).toBe('Producto');
  });
});
```

Note: also add `import { OrderStatus } from '@prisma/client';` to the spec imports if not already present.

- [ ] **Step 2: Run to confirm tests fail**

```bash
docker compose exec res-api-core pnpm test --testPathPattern="cash-register.service"
```

Expected: FAIL — `getTopProducts` method does not exist.

- [ ] **Step 3: Add `getTopProducts` to `cash-register.service.ts`**

Add this method after `getSessionSummary`:

```ts
async getTopProducts(sessionId: string) {
  const session = await this.registerSessionRepository.findById(sessionId);
  if (!session) throw new CashRegisterNotFoundException(sessionId);

  const topProductRows = await this.prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: {
        cashShiftId: session.id,
        status: { not: OrderStatus.CANCELLED },
      },
    },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 5,
  });

  const productIds = topProductRows.map((r) => r.productId);
  const products = await this.prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productNameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

  return {
    topProducts: topProductRows.map((r) => ({
      id: r.productId,
      name: productNameMap[r.productId] ?? 'Producto',
      quantity: r._sum.quantity ?? 0,
      total: r._sum.subtotal ?? 0n,
    })),
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
docker compose exec res-api-core pnpm test --testPathPattern="cash-register.service"
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.service.spec.ts
git commit -m "feat(cash-register): add getTopProducts service method"
```

---

### Task 4: Create `session-summary.serializer.ts` + fix `cash-shift.serializer.ts`

**Files:**
- Create: `apps/api-core/src/cash-register/serializers/session-summary.serializer.ts`
- Modify: `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts`

No unit tests for serializers themselves — they're covered at the e2e layer where actual BigInt → number conversion is asserted.

- [ ] **Step 1: Create `session-summary.serializer.ts`**

```ts
// apps/api-core/src/cash-register/serializers/session-summary.serializer.ts
import { fromCents } from '../../common/helpers/money';
import { OrderStatus } from '@prisma/client';

export interface OrderStatusGroup {
  count: number;
  total: number;
}

function serializeStatusGroups(
  ordersByStatus: Record<string, { count: number; total: bigint }>,
): Record<OrderStatus, OrderStatusGroup> {
  const result = {} as Record<OrderStatus, OrderStatusGroup>;
  for (const status of Object.values(OrderStatus)) {
    const g = ordersByStatus[status] ?? { count: 0, total: 0n };
    result[status] = { count: g.count, total: fromCents(g.total) };
  }
  return result;
}

function serializePaymentBreakdown(
  breakdown: Record<string, { count: number; total: bigint }>,
): Record<string, { count: number; total: number }> {
  const result: Record<string, { count: number; total: number }> = {};
  for (const [method, val] of Object.entries(breakdown)) {
    result[method] = { count: val.count, total: fromCents(val.total) };
  }
  return result;
}

export function serializeSessionSummary(summary: {
  ordersByStatus: Record<string, { count: number; total: bigint }>;
  totalSales: bigint;
  totalOrders: number;
  paymentBreakdown: Record<string, { count: number; total: bigint }>;
}) {
  return {
    ordersByStatus: serializeStatusGroups(summary.ordersByStatus),
    totalSales: fromCents(summary.totalSales),
    totalOrders: summary.totalOrders,
    paymentBreakdown: serializePaymentBreakdown(summary.paymentBreakdown),
  };
}

export function serializeTopProducts(topProducts: Array<{
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}>) {
  return topProducts.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    total: fromCents(p.total),
  }));
}
```

- [ ] **Step 2: Fix `cash-shift.serializer.ts` — use `fromCents()` for `openingBalance` and `totalSales`**

In `cash-shift.serializer.ts`, change the `@Transform` on `openingBalance` (line 29) from:

```ts
@Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? Number(value) : 0))
```

to:

```ts
@Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? fromCents(value) : 0))
```

Change the `@Transform` on `totalSales` (line 34) from:

```ts
@Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? Number(value) : null))
```

to:

```ts
@Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? fromCents(value) : null))
```

Also add the import at the top of `cash-shift.serializer.ts`:

```ts
import { fromCents } from '../../common/helpers/money';
```

- [ ] **Step 3: Build check**

```bash
docker compose exec res-api-core pnpm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/cash-register/serializers/session-summary.serializer.ts \
        apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts
git commit -m "feat(cash-register): add session-summary serializer with fromCents; fix cash-shift serializer"
```

---

### Task 5: Update DTOs

**Files:**
- Modify: `apps/api-core/src/cash-register/dto/cash-register-response.dto.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import { ApiProperty } from '@nestjs/swagger';

export class PaymentBreakdownDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class OrderStatusGroupDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class SessionSummaryDto {
  @ApiProperty() totalOrders: number;
  @ApiProperty() totalSales: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/PaymentBreakdownDto' },
  })
  paymentBreakdown: Record<string, PaymentBreakdownDto>;
}

export class OrdersByStatusDto {
  @ApiProperty({ type: OrderStatusGroupDto }) CREATED: OrderStatusGroupDto;
  @ApiProperty({ type: OrderStatusGroupDto }) PROCESSING: OrderStatusGroupDto;
  @ApiProperty({ type: OrderStatusGroupDto }) COMPLETED: OrderStatusGroupDto;
  @ApiProperty({ type: OrderStatusGroupDto }) CANCELLED: OrderStatusGroupDto;
}

export class NewSessionSummaryDto {
  @ApiProperty({ type: OrdersByStatusDto }) ordersByStatus: OrdersByStatusDto;
  @ApiProperty() totalSales: number;
  @ApiProperty() totalOrders: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/PaymentBreakdownDto' },
  })
  paymentBreakdown: Record<string, PaymentBreakdownDto>;
}

export class CashShiftDto {
  @ApiProperty() id: string;
  @ApiProperty() restaurantId: string;
  @ApiProperty() status: string;
  @ApiProperty() openedAt: Date;
  @ApiProperty({ required: false, nullable: true }) closedAt: Date | null;
  @ApiProperty({ required: false, nullable: true }) totalSales: number | null;
  @ApiProperty({ required: false, nullable: true }) totalOrders: number | null;
  @ApiProperty({ required: false, nullable: true }) closedBy: string | null;
}

export class CloseSessionResponseDto {
  @ApiProperty({ type: CashShiftDto }) session: CashShiftDto;
  @ApiProperty({ type: SessionSummaryDto }) summary: SessionSummaryDto;
}

export class TopProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() total: number;
}

export class TopProductsResponseDto {
  @ApiProperty({ type: [TopProductDto] }) topProducts: TopProductDto[];
}

export class SessionSummaryResponseDto {
  @ApiProperty({ type: CashShiftDto }) session: CashShiftDto;
  @ApiProperty({ type: NewSessionSummaryDto }) summary: NewSessionSummaryDto;
  @ApiProperty({ type: [Object] }) orders: any[];
}
```

- [ ] **Step 2: Build check**

```bash
docker compose exec res-api-core pnpm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/dto/cash-register-response.dto.ts
git commit -m "feat(cash-register): update DTOs for new summary shape and TopProductsResponseDto"
```

---

### Task 6: Update controller — use serializers + add `top-products` route

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`

- [ ] **Step 1: Update the controller**

Replace the full content of `cash-register.controller.ts` with:

```ts
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CashRegisterService } from './cash-register.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CashShiftSerializer } from './serializers/cash-shift.serializer';
import { PaginatedCashShiftsSerializer } from './serializers/paginated-cash-shifts.serializer';
import {
  CloseSessionResponseDto,
  SessionSummaryResponseDto,
  TopProductsResponseDto,
} from './dto/cash-register-response.dto';
import {
  serializeSessionSummary,
  serializeTopProducts,
} from './serializers/session-summary.serializer';

@ApiTags('Cash Register')
@ApiBearerAuth()
@Controller({ version: '1', path: 'cash-register' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CashRegisterController {
  constructor(private readonly registerService: CashRegisterService) {}

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir sesión de caja' })
  @ApiResponse({ status: 201, description: 'Sesión creada exitosamente', type: CashShiftSerializer })
  @ApiResponse({ status: 409, description: 'Ya existe una sesión de caja abierta (CASH_REGISTER_ALREADY_OPEN)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async open(@CurrentUser() user: { restaurantId: string; id: string }) {
    const session = await this.registerService.openSession(user.restaurantId, user.id);
    return new CashShiftSerializer(session);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión de caja activa' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada con resumen de ventas', type: CloseSessionResponseDto })
  @ApiResponse({ status: 409, description: 'No hay sesión de caja abierta (NO_OPEN_CASH_REGISTER)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async close(@CurrentUser() user: { restaurantId: string; id: string }) {
    const result = await this.registerService.closeSession(user.restaurantId, user.id);
    return {
      session: new CashShiftSerializer(result.session),
      summary: {
        totalOrders: result.summary.totalOrders,
        totalSales: result.summary.totalSales,
        paymentBreakdown: result.summary.paymentBreakdown,
      },
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial paginado de sesiones de caja' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: PaginatedCashShiftsSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async history(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    const result = await this.registerService.getSessionHistory(
      user.restaurantId,
      query.page,
      query.limit,
    );
    return new PaginatedCashShiftsSerializer({
      data: result.data.map((s) => new CashShiftSerializer(s)),
      meta: result.meta,
    });
  }

  @Get('current')
  @ApiOperation({ summary: 'Sesión de caja actualmente abierta' })
  @ApiResponse({ status: 200, type: CashShiftSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async current(@CurrentUser() user: { restaurantId: string }) {
    const session = await this.registerService.getCurrentSession(user.restaurantId);
    if (!('id' in session)) return {};
    return new CashShiftSerializer(session as any);
  }

  @Get('summary/:sessionId')
  @ApiOperation({ summary: 'Resumen detallado de una sesión de caja' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiResponse({ status: 200, type: SessionSummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async summary(@Param('sessionId') sessionId: string) {
    const result = await this.registerService.getSessionSummary(sessionId);
    return {
      session: new CashShiftSerializer(result.session),
      summary: serializeSessionSummary(result.summary),
      orders: result.orders,
    };
  }

  @Get('top-products/:sessionId')
  @ApiOperation({ summary: 'Top 5 productos más vendidos de una sesión' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiResponse({ status: 200, type: TopProductsResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async topProducts(@Param('sessionId') sessionId: string) {
    const result = await this.registerService.getTopProducts(sessionId);
    return { topProducts: serializeTopProducts(result.topProducts) };
  }
}
```

- [ ] **Step 2: Build check**

```bash
docker compose exec res-api-core pnpm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.controller.ts
git commit -m "feat(cash-register): add top-products route; wire summary serializer in controller"
```

---

### Task 7: Update frontend types (`apps/ui/src/components/dash/register/api.ts`)

**Files:**
- Modify: `apps/ui/src/components/dash/register/api.ts`

- [ ] **Step 1: Update the file**

Replace `SessionDetailSummary`, `SessionDetail`, and add `getTopProducts`. The final state of the relevant section (from line 88 onwards) should be:

```ts
export interface OrderStatusGroup {
  count: number;
  total: number;
}

export interface SessionDetailSummary {
  ordersByStatus: {
    CREATED: OrderStatusGroup;
    PROCESSING: OrderStatusGroup;
    COMPLETED: OrderStatusGroup;
    CANCELLED: OrderStatusGroup;
  };
  totalSales: number;
  totalOrders: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
}

export interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

export interface TopProductsResult {
  topProducts: TopProduct[];
}

export interface SessionDetail {
  session: CashShiftDto;
  summary: SessionDetailSummary;
  orders: unknown[];
}

export async function getSessionDetail(sessionId: string): Promise<ApiResult<SessionDetail>> {
  const res = await apiFetch(`/v1/cash-register/summary/${sessionId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function getTopProducts(sessionId: string): Promise<ApiResult<TopProductsResult>> {
  const res = await apiFetch(`/v1/cash-register/top-products/${sessionId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

Keep everything above `SessionDetailSummary` (lines 1–87) unchanged. Remove the old `SessionDetailSummary`, `TopProduct`, and `SessionDetail` interfaces and the old `getSessionDetail` function.

- [ ] **Step 2: TypeScript check**

```bash
cd apps/ui && pnpm tsc --noEmit 2>&1 | tail -20
```

Expected: no errors related to the modified file. (Errors in `RegisterSummaryModal.tsx` about missing `topProducts`/`completedOrders` are expected — the spec marks UI component changes as out-of-scope.)

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/register/api.ts
git commit -m "feat(ui): update SessionDetailSummary types for new summary shape; add getTopProducts"
```

---

### Task 8: Update e2e tests — `sessionSummary.e2e-spec.ts`

**Files:**
- Modify: `apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts`

- [ ] **Step 1: Replace the file with updated tests**

```ts
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
  let basicToken: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CREATED');
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

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
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

  it('summary contiene ordersByStatus con las cuatro claves', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { ordersByStatus } = res.body.summary;
    expect(ordersByStatus).toBeDefined();
    for (const key of ['CREATED', 'PROCESSING', 'COMPLETED', 'CANCELLED']) {
      expect(ordersByStatus[key]).toBeDefined();
      expect(typeof ordersByStatus[key].count).toBe('number');
      expect(typeof ordersByStatus[key].total).toBe('number');
    }
  });

  it('totalSales excluye CANCELLED (suma CREATED + PROCESSING + COMPLETED en pesos)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { summary } = res.body;
    expect(typeof summary.totalSales).toBe('number');
    // 1 COMPLETED (1000 centavos) + 1 CREATED (1000 centavos) = 2000 centavos = 20 pesos
    expect(summary.totalSales).toBeCloseTo(20, 2);
  });

  it('totalOrders cuenta todas las órdenes de la sesión', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.totalOrders).toBe(3);
  });

  it('paymentBreakdown solo incluye métodos de órdenes COMPLETED, con totales en pesos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { paymentBreakdown } = res.body.summary;
    expect(paymentBreakdown).toBeDefined();
    for (const val of Object.values(paymentBreakdown) as any[]) {
      expect(typeof val.count).toBe('number');
      expect(typeof val.total).toBe('number');
    }
  });

  it('summary NO contiene completedOrders, cancelledOrders ni topProducts', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.completedOrders).toBeUndefined();
    expect(res.body.summary.cancelledOrders).toBeUndefined();
    expect(res.body.summary.topProducts).toBeUndefined();
  });

  it('ordersByStatus.CANCELLED count refleja las órdenes canceladas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.ordersByStatus.CANCELLED.count).toBe(1);
    expect(res.body.summary.ordersByStatus.COMPLETED.count).toBe(1);
    expect(res.body.summary.ordersByStatus.CREATED.count).toBe(1);
    expect(res.body.summary.ordersByStatus.PROCESSING.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run e2e tests**

```bash
docker compose exec res-api-core pnpm test:e2e --testPathPattern="sessionSummary"
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/cash-register/sessionSummary.e2e-spec.ts
git commit -m "test(cash-register): update sessionSummary e2e for new response shape"
```

---

### Task 9: Update e2e `closeSession` + add `topProducts` e2e tests

**Files:**
- Modify: `apps/api-core/test/cash-register/closeSession.e2e-spec.ts`
- Create: `apps/api-core/test/cash-register/topProducts.e2e-spec.ts`

- [ ] **Step 1: Add COMPLETED-only test to `closeSession.e2e-spec.ts`**

Append this test inside the existing `describe` block, after the last `it(...)`:

```ts
it('summary.totalSales refleja solo órdenes COMPLETED (excluye CANCELLED)', async () => {
  const restMixed = await seedRestaurant(prisma, 'Mixed');
  const tokenMixed = await login(app, restMixed.admin.email);
  const product = await seedProduct(prisma, restMixed.restaurant.id, restMixed.category.id);
  const shiftMixed = await openCashShiftViaApi(app, tokenMixed);
  // 1 COMPLETED order (1000 centavos = 10 pesos) + 1 CANCELLED (should be excluded)
  await seedOrderOnShift(prisma, restMixed.restaurant.id, shiftMixed, product.id, 'COMPLETED');
  await seedOrderOnShift(prisma, restMixed.restaurant.id, shiftMixed, product.id, 'CANCELLED');

  const res = await request(app.getHttpServer())
    .post('/v1/cash-register/close')
    .set('Authorization', `Bearer ${tokenMixed}`)
    .expect(200);

  // Only the COMPLETED order counts (1000 centavos = 10 pesos via fromCents)
  expect(res.body.summary.totalSales).toBeCloseTo(10, 2);
  expect(res.body.summary.totalOrders).toBe(1);
});
```

- [ ] **Step 2: Create `topProducts.e2e-spec.ts`**

```ts
// test/cash-register/topProducts.e2e-spec.ts
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

const TEST_DB = path.resolve(__dirname, 'test-top-products.db');

describe('GET /v1/cash-register/top-products/:sessionId (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'TP');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED');
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sesión inexistente → 404 REGISTER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/top-products/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('REGISTER_NOT_FOUND');
  });

  it('Retorna topProducts array con máx 5 elementos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.topProducts)).toBe(true);
    expect(res.body.topProducts.length).toBeLessThanOrEqual(5);
  });

  it('Cada elemento tiene id, name, quantity (number) y total (pesos decimal)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    if (res.body.topProducts.length > 0) {
      const top = res.body.topProducts[0];
      expect(top.id).toBeDefined();
      expect(typeof top.name).toBe('string');
      expect(typeof top.quantity).toBe('number');
      expect(typeof top.total).toBe('number');
    }
  });

  it('Excluye ítems de órdenes CANCELLED — solo 1 producto visible (del COMPLETED)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Both orders use the same product, but CANCELLED is excluded.
    // Quantity should be 1 (only the COMPLETED order item).
    expect(res.body.topProducts).toHaveLength(1);
    expect(res.body.topProducts[0].quantity).toBe(1);
  });

  it('total está en pesos (1000 centavos → 10 pesos)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/top-products/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.topProducts[0].total).toBeCloseTo(10, 2);
  });
});
```

- [ ] **Step 3: Run e2e tests**

```bash
docker compose exec res-api-core pnpm test:e2e --testPathPattern="closeSession|topProducts"
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/cash-register/closeSession.e2e-spec.ts \
        test/cash-register/topProducts.e2e-spec.ts
git commit -m "test(cash-register): add COMPLETED-only close e2e; add topProducts e2e suite"
```

---

### Task 10: Update `cash-register.module.info.md`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.module.info.md`

- [ ] **Step 1: Update the module info file**

Make the following targeted changes to the file:

**1. Replace `CloseSessionResponseDto` example** — change `summary.totalSales` note to reflect COMPLETED-only:

```json
"summary": {
  "totalOrders": 2,
  "totalSales": 20.0,
  "paymentBreakdown": {
    "CASH": { "count": 2, "total": 20.0 }
  }
}
```

**2. Replace `SessionSummaryResponseDto` example:**

```json
{
  "session": { "...": "CashShiftDto" },
  "summary": {
    "ordersByStatus": {
      "CREATED":    { "count": 1, "total": 10.0 },
      "PROCESSING": { "count": 0, "total": 0.0 },
      "COMPLETED":  { "count": 2, "total": 20.0 },
      "CANCELLED":  { "count": 1, "total": 10.0 }
    },
    "totalSales": 30.0,
    "totalOrders": 4,
    "paymentBreakdown": {
      "CASH": { "count": 2, "total": 20.0 }
    }
  },
  "orders": []
}
```

**3. Add `TopProductsResponseDto` example after the summary example:**

```markdown
**TopProductsResponseDto** — usado en GET /top-products/:sessionId:

\`\`\`json
{
  "topProducts": [
    { "id": "string", "name": "Burger", "quantity": 15, "total": 75.0 }
  ]
}
\`\`\`
```

**4. Add new endpoint row** to the endpoint table:

```
| `GET` | `/v1/cash-register/top-products/:sessionId` | ADMIN, MANAGER | `TopProductsResponseDto` | Top 5 productos más vendidos de una sesión |
```

**5. Update Summary E2E section** — replace `completedOrders`/`cancelledOrders`/`topProducts` references with `ordersByStatus`.

**6. Update Close E2E section** — add row:
```
| `summary.totalSales` solo refleja COMPLETED | 200 | CANCELLED excluidas del total |
```

**7. Add Top-products E2E section:**

```markdown
#### Top-products — `GET /v1/cash-register/top-products/:sessionId`

E2E: ✅ `test/cash-register/topProducts.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| Sesión válida | 200 | `topProducts` array, máx 5 elementos |
| Órdenes CANCELLED excluidas | 200 | Solo items de órdenes no canceladas |
| Sesión no encontrada | 404 | `REGISTER_NOT_FOUND` |
```

**8. Update implementation notes** — replace "`Number()` directo" with "`fromCents()`".

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.module.info.md
git commit -m "docs(cash-register): update module.info.md for summary redesign and top-products endpoint"
```

---

### Task 11: Full test run + verify

- [ ] **Step 1: Run all unit tests**

```bash
docker compose exec res-api-core pnpm test
```

Expected: all pass.

- [ ] **Step 2: Run all cash-register e2e tests**

```bash
docker compose exec res-api-core pnpm test:e2e --testPathPattern="cash-register"
```

Expected: all pass.

- [ ] **Step 3: Build check**

```bash
docker compose exec res-api-core pnpm run build 2>&1 | tail -10
```

Expected: no errors.
