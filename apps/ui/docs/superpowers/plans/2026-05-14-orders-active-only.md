# Orders Active-Only Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only active orders (CREATED, PROCESSING) by default in the orders panel, raising the limit to 100 and removing the client-side multi-status filter hack.

**Architecture:** Add a `statuses[]` query param to `GET /v1/orders` (the repository already supports it); update the controller to parse and merge `statuses[]` with the existing singular `status` param; update the frontend to always send statuses to the backend, removing client-side filtering entirely; strip COMPLETED/CANCELLED columns from the kanban.

**Tech Stack:** NestJS (Jest), Astro + React (Vitest), Prisma, Tailwind CSS

**Spec:** `apps/ui/docs/superpowers/specs/2026-05-14-orders-active-only-design.md`

---

## File Map

**Backend (apps/api-core/src/orders/):**
- Modify: `orders.service.ts` — replace `status?` with `statuses?` in `findByRestaurantId`
- Modify: `orders.controller.ts` — parse `statuses[]` query param, merge with singular `status`, raise limit cap to 100
- Modify: `orders.service.spec.ts` — update `findByRestaurantId` describe block
- Create: `orders.controller.spec.ts` — test statuses parsing, limit cap, merge/dedup logic

**Frontend (apps/ui/src/components/dash/orders/):**
- Modify: `api.ts` — replace `status?: string` with `statuses?: string[]`, serialize as repeated `statuses[]=X` params
- Modify: `OrdersPanel.tsx` — default query `statuses: ['CREATED', 'PROCESSING'], limit: 100`; remove client-side status filter
- Modify: `OrdersKanban.tsx` — remove secondary columns (COMPLETED, CANCELLED) and toggle button
- Modify: `OrdersFilteredList.tsx` — add footer note when result count equals 100
- Create: `api.test.ts` — test `getOrders` statuses serialization
- Modify: `OrdersPanel.test.tsx` — update limit/banner tests, banner text

---

## Task 1: Update OrdersService.findByRestaurantId to accept statuses array

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`
- Modify: `apps/api-core/src/orders/orders.service.ts`

- [ ] **Step 1: Write failing tests — replace `findByRestaurantId` describe block in the spec**

In `apps/api-core/src/orders/orders.service.spec.ts`, replace the entire `describe('findByRestaurantId', ...)` block (lines 347–370):

```typescript
describe('findByRestaurantId', () => {
  it('returns orders for a restaurantId', async () => {
    const orders = [makeOrder()];
    mockOrderRepository.findByRestaurantId.mockResolvedValue(orders);
    const result = await service.findByRestaurantId('r1');
    expect(result).toEqual(orders);
  });

  it('passes statuses array and limit to repository', async () => {
    mockOrderRepository.findByRestaurantId.mockResolvedValue([]);
    await service.findByRestaurantId('r1', [OrderStatus.CREATED], 15);
    expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith(
      'r1', undefined, [OrderStatus.CREATED], 15, undefined, undefined,
    );
  });

  it('passes multiple statuses to repository', async () => {
    mockOrderRepository.findByRestaurantId.mockResolvedValue([]);
    await service.findByRestaurantId('r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100);
    expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith(
      'r1', undefined, [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined, undefined,
    );
  });

  it('passes undefined statuses and limit when called with no args', async () => {
    mockOrderRepository.findByRestaurantId.mockResolvedValue([]);
    await service.findByRestaurantId('r1');
    expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith(
      'r1', undefined, undefined, undefined, undefined, undefined,
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: FAIL — old signature uses `status?: OrderStatus` as second param, tests pass `OrderStatus[]`

- [ ] **Step 3: Update service implementation**

In `apps/api-core/src/orders/orders.service.ts`, replace the `findByRestaurantId` method (lines 95–103):

```typescript
async findByRestaurantId(
  restaurantId: string,
  statuses?: OrderStatus[],
  limit?: number,
  cashShiftId?: string,
  orderNumber?: number,
) {
  return this.orderRepository.findByRestaurantId(restaurantId, undefined, statuses, limit, cashShiftId, orderNumber);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.service.spec.ts
git commit -m "feat(api/orders): replace singular status with statuses array in findByRestaurantId"
```

---

## Task 2: Update OrdersController — parse statuses[], raise limit cap to 100

**Files:**
- Create: `apps/api-core/src/orders/orders.controller.spec.ts`
- Modify: `apps/api-core/src/orders/orders.controller.ts`

- [ ] **Step 1: Create controller spec with failing tests**

Create `apps/api-core/src/orders/orders.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TimezoneService } from '../restaurants/timezone.service';

const mockOrdersService = { findByRestaurantId: jest.fn() };
const mockTimezoneService = { getTimezone: jest.fn().mockResolvedValue('UTC') };
const user = { restaurantId: 'r1' };

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();
    controller = module.get<OrdersController>(OrdersController);
    jest.clearAllMocks();
    mockOrdersService.findByRestaurantId.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('defaults limit to 100 when not provided', async () => {
      await controller.findAll(user);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', undefined, 100, undefined, undefined,
      );
    });

    it('caps limit at 100', async () => {
      await controller.findAll(user, undefined, undefined, undefined, '500');
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', undefined, 100, undefined, undefined,
      );
    });

    it('passes statuses array to service', async () => {
      await controller.findAll(user, undefined, undefined, undefined, undefined, ['CREATED', 'PROCESSING']);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined, undefined,
      );
    });

    it('normalizes single string statuses param to one-element array', async () => {
      await controller.findAll(user, undefined, undefined, undefined, undefined, 'CREATED' as any);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED], 100, undefined, undefined,
      );
    });

    it('merges singular status param into statuses array', async () => {
      await controller.findAll(user, undefined, undefined, OrderStatus.CREATED, undefined, ['PROCESSING']);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.PROCESSING, OrderStatus.CREATED], 100, undefined, undefined,
      );
    });

    it('does not duplicate singular status already present in statuses array', async () => {
      await controller.findAll(user, undefined, undefined, OrderStatus.CREATED, undefined, ['CREATED', 'PROCESSING']);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined, undefined,
      );
    });

    it('throws BadRequestException for invalid status value in statuses param', async () => {
      await expect(
        controller.findAll(user, undefined, undefined, undefined, undefined, ['INVALID'] as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes undefined statuses when no status params provided', async () => {
      await controller.findAll(user, 'session-1');
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', undefined, 100, 'session-1', undefined,
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.controller
```

Expected: FAIL — controller does not yet parse `statuses` param, limit is 30

- [ ] **Step 3: Update controller — add BadRequestException import**

In `apps/api-core/src/orders/orders.controller.ts`, update the `@nestjs/common` import (line 1):

```typescript
import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, ParseIntPipe, ParseEnumPipe, BadRequestException,
} from '@nestjs/common';
```

- [ ] **Step 4: Update Swagger @ApiQuery decorators**

Replace the `@ApiQuery` for `limit` (line 34) and add one for `statuses`:

```typescript
@ApiQuery({ name: 'statuses', required: false, enum: OrderStatus, isArray: true, description: 'Filtrar por múltiples estados. Repetir param: statuses[]=CREATED&statuses[]=PROCESSING' })
@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo de registros (default 100, max 100)' })
```

- [ ] **Step 5: Update findAll method signature and body**

Replace the entire `findAll` method (lines 39–57):

```typescript
async findAll(
  @CurrentUser() user: { restaurantId: string },
  @Query('cashShiftId') cashShiftId?: string,
  @Query('orderNumber', new ParseIntPipe({ optional: true })) orderNumber?: number,
  @Query('status', new ParseEnumPipe(OrderStatus, { optional: true })) status?: OrderStatus,
  @Query('limit') limit?: string,
  @Query('statuses') rawStatuses?: string | string[],
) {
  const rawArray = rawStatuses
    ? (Array.isArray(rawStatuses) ? rawStatuses : [rawStatuses])
    : [];
  const mergedStatuses: OrderStatus[] = [];
  for (const s of rawArray) {
    if (!Object.values(OrderStatus).includes(s as OrderStatus)) {
      throw new BadRequestException(`Valor de status inválido: ${s}`);
    }
    mergedStatuses.push(s as OrderStatus);
  }
  if (status && !mergedStatuses.includes(status)) {
    mergedStatuses.push(status);
  }

  const take = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 100)) : 100;
  const orders = await this.ordersService.findByRestaurantId(
    user.restaurantId,
    mergedStatuses.length ? mergedStatuses : undefined,
    take,
    cashShiftId,
    orderNumber,
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

- [ ] **Step 6: Run all orders tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders
```

Expected: All tests PASS (service + controller)

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/orders/orders.controller.ts apps/api-core/src/orders/orders.controller.spec.ts
git commit -m "feat(api/orders): add statuses[] query param and raise limit cap to 100"
```

---

## Task 3: Update api.ts — serialize statuses as repeated params

**Files:**
- Create: `apps/ui/src/components/dash/orders/api.test.ts`
- Modify: `apps/ui/src/components/dash/orders/api.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/ui/src/components/dash/orders/api.test.ts`:

```typescript
import { getOrders } from './api';
import { apiFetch } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }),
}));

const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

describe('getOrders', () => {
  it('serializes statuses as repeated statuses[] params', async () => {
    await getOrders({ statuses: ['CREATED', 'PROCESSING'] });
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).toContain('statuses[]=CREATED');
    expect(url).toContain('statuses[]=PROCESSING');
  });

  it('includes limit param when provided', async () => {
    await getOrders({ limit: 100 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=100');
  });

  it('omits statuses from URL when not provided', async () => {
    await getOrders({ cashShiftId: 'cs1' });
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).not.toContain('statuses');
  });

  it('includes cashShiftId and orderNumber in URL', async () => {
    await getOrders({ cashShiftId: 'cs1', orderNumber: 42 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('cashShiftId=cs1');
    expect(url).toContain('orderNumber=42');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
docker compose exec res-ui pnpm test -- api.test
```

Expected: FAIL — `getOrders` does not accept `statuses` param

- [ ] **Step 3: Replace getOrders in api.ts**

In `apps/ui/src/components/dash/orders/api.ts`, replace the `getOrders` function (lines 51–68):

```typescript
export async function getOrders(params: {
  cashShiftId?: string;
  orderNumber?: number;
  statuses?: string[];
  limit?: number;
}): Promise<ApiResult<Order[]>> {
  const query = new URLSearchParams();
  if (params.cashShiftId) query.set('cashShiftId', params.cashShiftId);
  if (params.orderNumber !== undefined) query.set('orderNumber', String(params.orderNumber));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.statuses?.length) {
    for (const s of params.statuses) {
      query.append('statuses[]', s);
    }
  }
  const res = await apiFetch(`/v1/orders?${query}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker compose exec res-ui pnpm test -- api.test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/api.ts apps/ui/src/components/dash/orders/api.test.ts
git commit -m "feat(ui/orders): update getOrders() to serialize statuses as repeated statuses[] params"
```

---

## Task 4: Update OrdersPanel.tsx — default query and remove client-side filtering

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

- [ ] **Step 1: Update failing tests in OrdersPanel.test.tsx**

Replace the two tests at lines 51–77 with these updated versions:

```typescript
test('when session is open, fetches active orders with statuses and limit=100', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(mockGetOrders).toHaveBeenCalledWith({
      cashShiftId: 'shift-xyz',
      statuses: ['CREATED', 'PROCESSING'],
      limit: 100,
    }),
  );
});

test('when session is open, shows session banner with máx 100 note', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(screen.getByText('máx. 100 pedidos')).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-ui pnpm test -- OrdersPanel.test
```

Expected: FAIL — `getOrders` called with `limit: 30`, banner shows "máx. 30 pedidos"

- [ ] **Step 3: Replace fetchOrders in OrdersPanel.tsx**

In `apps/ui/src/components/dash/orders/OrdersPanel.tsx`, replace the `fetchOrders` function (lines 36–47):

```typescript
async function fetchOrders(cashShiftId: string, filter: ActiveFilter | null) {
  const statuses = filter?.statuses.length ? filter.statuses : ['CREATED', 'PROCESSING'];
  const params: Parameters<typeof getOrders>[0] = { cashShiftId, limit: 100, statuses };
  if (filter?.orderNumber) params.orderNumber = filter.orderNumber;
  const result = await getOrders(params);
  if (result.ok) setOrders(result.data);
}
```

- [ ] **Step 4: Update the session banner text in OrdersPanel.tsx**

Find and replace the text `máx. 30 pedidos` with `máx. 100 pedidos` (line 209).

- [ ] **Step 5: Run tests to verify they pass**

```bash
docker compose exec res-ui pnpm test -- OrdersPanel.test
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "feat(ui/orders): default to active-only query (CREATED+PROCESSING, limit 100); remove client-side filter"
```

---

## Task 5: Simplify OrdersKanban.tsx — remove secondary columns

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersKanban.tsx`

- [ ] **Step 1: Rewrite OrdersKanban.tsx without secondary columns**

Replace the entire file content:

```typescript
import type { Order } from './api';
import type { OrderCardCallbacks } from './OrderCard';
import OrderCard from './OrderCard';

const COLUMNS = [
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

interface OrdersKanbanProps extends OrderCardCallbacks {
  orders: Order[];
}

export default function OrdersKanban({ orders, onAdvance, onPay, onCancel, onReceipt }: OrdersKanbanProps) {
  const byStatus = (status: string) => orders.filter((o) => o.status === status);
  const cardCallbacks = { onAdvance, onPay, onCancel, onReceipt };

  return (
    <div className="grid grid-cols-2 gap-4">
      {COLUMNS.map(({ status, label, bg, border, text, badgeBg }) => {
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
  );
}
```

- [ ] **Step 2: Run all UI tests to confirm nothing broke**

```bash
docker compose exec res-ui pnpm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersKanban.tsx
git commit -m "feat(ui/orders): remove secondary kanban columns (COMPLETED, CANCELLED)"
```

---

## Task 6: Add 100-result footer to OrdersFilteredList.tsx

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersFilteredList.tsx`

- [ ] **Step 1: Add footer to OrdersFilteredList.tsx**

Replace the entire file content:

```typescript
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
      {orders.length === 100 && (
        <p className="text-xs text-slate-400 text-center py-2">
          Se muestran los primeros 100 pedidos. Para ver el historial completo,{' '}
          <a href="/dash/orders-history" className="underline hover:text-slate-600">
            ve al historial de pedidos →
          </a>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all UI tests**

```bash
docker compose exec res-ui pnpm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersFilteredList.tsx
git commit -m "feat(ui/orders): show 100-result cap notice with history link in filtered list"
```
