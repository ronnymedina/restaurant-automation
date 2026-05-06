# Cash Register Session Date Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `dateFrom`/`dateTo` query parameters to `GET /v1/cash-register/history` so managers can filter cash shift sessions by their opening date in the restaurant's local timezone.

**Architecture:** `CashShiftRepository.findByRestaurantIdPaginated` gains an optional `{ dateFrom?, dateTo? }` filter applied to `openedAt`. `CashRegisterService.getSessionHistory` injects `TimezoneService` (imported via `RestaurantsModule`), converts the incoming date strings to UTC boundaries via `toUtcBoundary`, and passes them to the repository. The controller exposes `dateFrom`/`dateTo` as query params. The frontend `register-history.astro` adds date inputs and passes them through to the API.

**Tech Stack:** NestJS, Prisma (PostgreSQL/SQLite), `toUtcBoundary` utility, Jest, Supertest, Astro + Tailwind

---

## File Map

### Modified backend files
| Path | Change |
|---|---|
| `src/cash-register/cash-register-session.repository.ts` | Add optional `filters?: { dateFrom?: Date; dateTo?: Date }` to `findByRestaurantIdPaginated` |
| `src/cash-register/cash-register.service.ts` | Inject `TimezoneService`; add `dateFrom?`, `dateTo?` to `getSessionHistory`; use `toUtcBoundary` |
| `src/cash-register/cash-register.module.ts` | Add `RestaurantsModule` to imports |
| `src/cash-register/cash-register.controller.ts` | Add `dateFrom`, `dateTo` `@Query` params to `history` endpoint |
| `src/cash-register/cash-register.service.spec.ts` | Add `TimezoneService` mock + `getSessionHistory` date-filter tests |
| `test/cash-register/cash-register.helpers.ts` | Add `seedCashShift` helper with `openedAt` override |
| `test/cash-register/sessionHistory.e2e-spec.ts` | Add `dateFrom`/`dateTo` e2e tests |

### Modified frontend files
| Path | Change |
|---|---|
| `apps/ui/src/pages/dash/register-history.astro` | Add date filter UI; update `loadHistory` to pass `dateFrom`/`dateTo` |

---

## Task 1: Unit tests for getSessionHistory date filtering (TDD — write first)

**Files:**
- Modify: `src/cash-register/cash-register.service.spec.ts`

- [ ] **Step 1: Add TimezoneService mock**

Add the mock near the top of the spec file, alongside the other mocks:

```ts
import { TimezoneService } from '../restaurants/timezone.service';

const mockTimezoneService = {
  getTimezone: jest.fn().mockResolvedValue('UTC'),
};
```

- [ ] **Step 2: Register mock in the test module**

In `Test.createTestingModule({ providers: [...] })`, add:

```ts
{ provide: TimezoneService, useValue: mockTimezoneService },
```

- [ ] **Step 3: Reset timezone mock in beforeEach**

In the existing `beforeEach`, after `jest.clearAllMocks()`, re-wire the timezone mock (clearAllMocks resets return values):

```ts
mockTimezoneService.getTimezone.mockResolvedValue('UTC');
```

- [ ] **Step 4: Write the failing test suite**

Add this describe block at the end of `describe('CashRegisterService', ...)`:

```ts
describe('getSessionHistory', () => {
  beforeEach(() => {
    mockRegisterSessionRepository.findByRestaurantIdPaginated.mockResolvedValue({
      data: [],
      total: 0,
    });
  });

  it('calls getTimezone with the restaurantId', async () => {
    await service.getSessionHistory('restaurant-uuid-1');
    expect(mockTimezoneService.getTimezone).toHaveBeenCalledWith('restaurant-uuid-1');
  });

  it('passes undefined date filters when none provided', async () => {
    await service.getSessionHistory('restaurant-uuid-1');
    expect(mockRegisterSessionRepository.findByRestaurantIdPaginated).toHaveBeenCalledWith(
      'restaurant-uuid-1',
      0,
      expect.any(Number),
      { dateFrom: undefined, dateTo: undefined },
    );
  });

  it('converts dateFrom to UTC start-of-day boundary for the restaurant timezone', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('America/Mexico_City');
    await service.getSessionHistory('restaurant-uuid-1', 1, 10, '2026-01-15');
    // Mexico City is UTC-6 in January; midnight local = 06:00 UTC
    expect(mockRegisterSessionRepository.findByRestaurantIdPaginated).toHaveBeenCalledWith(
      'restaurant-uuid-1',
      0,
      10,
      expect.objectContaining({ dateFrom: new Date('2026-01-15T06:00:00.000Z') }),
    );
  });

  it('converts dateTo to UTC end-of-day boundary for the restaurant timezone', async () => {
    mockTimezoneService.getTimezone.mockResolvedValue('America/Mexico_City');
    await service.getSessionHistory('restaurant-uuid-1', 1, 10, undefined, '2026-01-15');
    // End of Jan 15 in Mexico City = 2026-01-16T05:59:59.999Z UTC
    expect(mockRegisterSessionRepository.findByRestaurantIdPaginated).toHaveBeenCalledWith(
      'restaurant-uuid-1',
      0,
      10,
      expect.objectContaining({ dateTo: new Date('2026-01-16T05:59:59.999Z') }),
    );
  });
});
```

- [ ] **Step 5: Run tests — expect failure**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register.service
```

Expected: FAIL — `getTimezone is not a function` or provider not found (because `TimezoneService` is not yet in the module under test, and `getSessionHistory` doesn't call it yet).

- [ ] **Step 6: Commit the failing tests**

```bash
git add src/cash-register/cash-register.service.spec.ts
git commit -m "test(cash-register): add failing getSessionHistory date-filter tests [TDD]"
```

---

## Task 2: Update repository to accept date filters

**Files:**
- Modify: `src/cash-register/cash-register-session.repository.ts`

- [ ] **Step 1: Replace findByRestaurantIdPaginated**

```ts
async findByRestaurantIdPaginated(
  restaurantId: string,
  skip: number,
  take: number,
  filters?: { dateFrom?: Date; dateTo?: Date },
): Promise<{ data: CashShift[]; total: number }> {
  const dateFilter =
    filters?.dateFrom || filters?.dateTo
      ? {
          openedAt: {
            ...(filters?.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters?.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {};

  const where = { restaurantId, ...dateFilter };

  const [data, total] = await Promise.all([
    this.prisma.cashShift.findMany({
      where,
      skip,
      take,
      orderBy: { openedAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    }),
    this.prisma.cashShift.count({ where }),
  ]);
  return { data, total };
}
```

---

## Task 3: Wire TimezoneService into CashRegisterModule and update getSessionHistory

**Files:**
- Modify: `src/cash-register/cash-register.module.ts`
- Modify: `src/cash-register/cash-register.service.ts`

- [ ] **Step 1: Import RestaurantsModule in CashRegisterModule**

Replace the full content of `src/cash-register/cash-register.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { CashShiftRepository } from './cash-register-session.repository';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [OrdersModule, RestaurantsModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashShiftRepository],
  exports: [CashRegisterService, CashShiftRepository],
})
export class CashRegisterModule {}
```

- [ ] **Step 2: Inject TimezoneService and update getSessionHistory**

In `src/cash-register/cash-register.service.ts`:

Add imports at the top:
```ts
import { TimezoneService } from '../restaurants/timezone.service';
import { toUtcBoundary } from '../common/date.utils';
```

Update the constructor to inject `TimezoneService`:
```ts
constructor(
  private readonly registerSessionRepository: CashShiftRepository,
  private readonly orderRepository: OrderRepository,
  private readonly prisma: PrismaService,
  private readonly timezoneService: TimezoneService,
) {}
```

Replace `getSessionHistory`:
```ts
async getSessionHistory(
  restaurantId: string,
  page?: number,
  limit?: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<PaginatedResult<CashShift>> {
  const currentPage = page || 1;
  const currentLimit = limit || DEFAULT_PAGE_SIZE;
  const skip = (currentPage - 1) * currentLimit;

  const timezone = await this.timezoneService.getTimezone(restaurantId);
  const filters = {
    dateFrom: dateFrom ? toUtcBoundary(dateFrom, timezone, 'start') : undefined,
    dateTo: dateTo ? toUtcBoundary(dateTo, timezone, 'end') : undefined,
  };

  const { data, total } = await this.registerSessionRepository.findByRestaurantIdPaginated(
    restaurantId,
    skip,
    currentLimit,
    filters,
  );

  return {
    data,
    meta: {
      total,
      page: currentPage,
      limit: currentLimit,
      totalPages: Math.ceil(total / currentLimit),
    },
  };
}
```

- [ ] **Step 3: Run unit tests — expect pass**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register.service
```

Expected: PASS — all tests including the 4 new `getSessionHistory` date-filter tests.

- [ ] **Step 4: Commit**

```bash
git add src/cash-register/cash-register.module.ts src/cash-register/cash-register.service.ts src/cash-register/cash-register-session.repository.ts
git commit -m "feat(cash-register): timezone-aware dateFrom/dateTo filter in getSessionHistory"
```

---

## Task 4: Expose query params in the controller

**Files:**
- Modify: `src/cash-register/cash-register.controller.ts`

- [ ] **Step 1: Update the history endpoint**

Find the `@Get('history')` handler and replace the decorator block and method:

```ts
@Get('history')
@ApiOperation({ summary: 'Historial paginado de sesiones de caja' })
@ApiQuery({ name: 'page', required: false, type: Number })
@ApiQuery({ name: 'limit', required: false, type: Number })
@ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Fecha inicio YYYY-MM-DD' })
@ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Fecha fin YYYY-MM-DD' })
@ApiResponse({ status: 200, description: 'Lista paginada de sesiones' })
@ApiResponse({ status: 401, description: 'No autenticado' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
async history(
  @CurrentUser() user: { restaurantId: string },
  @Query() query: PaginationDto,
  @Query('dateFrom') dateFrom?: string,
  @Query('dateTo') dateTo?: string,
) {
  return this.registerService.getSessionHistory(
    user.restaurantId,
    query.page,
    query.limit,
    dateFrom,
    dateTo,
  );
}
```

- [ ] **Step 2: Run all unit tests**

```bash
cd apps/api-core && pnpm test
```

Expected: PASS — all tests.

- [ ] **Step 3: Commit**

```bash
git add src/cash-register/cash-register.controller.ts
git commit -m "feat(cash-register): expose dateFrom/dateTo on GET /cash-register/history"
```

---

## Task 5: E2E tests for session history date filtering

**Files:**
- Modify: `test/cash-register/cash-register.helpers.ts`
- Modify: `test/cash-register/sessionHistory.e2e-spec.ts`

- [ ] **Step 1: Add seedCashShift helper**

In `test/cash-register/cash-register.helpers.ts`, add at the end of the file:

```ts
export async function seedCashShift(
  prisma: PrismaService,
  restaurantId: string,
  userId: string,
  overrides: { openedAt?: Date; status?: string; closedAt?: Date } = {},
) {
  return prisma.cashShift.create({
    data: {
      restaurantId,
      userId,
      ...(overrides.openedAt ? { openedAt: overrides.openedAt } : {}),
      ...(overrides.status ? { status: overrides.status as any } : {}),
      ...(overrides.closedAt ? { closedAt: overrides.closedAt } : {}),
    },
  });
}
```

- [ ] **Step 2: Add date-filter tests to sessionHistory.e2e-spec.ts**

Add `seedCashShift` to the import line at the top:

```ts
import { bootstrapApp, seedRestaurant, login, openCashShiftViaApi, seedCashShift } from './cash-register.helpers';
```

Add a new describe block at the end of the outer `describe`:

```ts
describe('Filtro por fecha con timezone (America/Mexico_City)', () => {
  let tzToken: string;
  let shiftInDayId: string;
  let shiftBeforeId: string;
  let shiftAfterId: string;

  beforeAll(async () => {
    const rest = await seedRestaurant(prisma, 'TZ');
    tzToken = await login(app, rest.admin.email);

    // Set Mexico City timezone (UTC-6 in January)
    await prisma.restaurantSettings.update({
      where: { restaurantId: rest.restaurant.id },
      data: { timezone: 'America/Mexico_City' },
    });

    // Jan 14, 23:59:59 Mexico City = 2026-01-15T05:59:59Z → NOT in Jan 15 local
    const before = await seedCashShift(prisma, rest.restaurant.id, rest.admin.id, {
      openedAt: new Date('2026-01-15T05:59:59.000Z'),
    });
    shiftBeforeId = before.id;

    // Jan 15, 00:00:00 Mexico City = 2026-01-15T06:00:00Z → IS in Jan 15 local
    const inside = await seedCashShift(prisma, rest.restaurant.id, rest.admin.id, {
      openedAt: new Date('2026-01-15T06:00:00.000Z'),
    });
    shiftInDayId = inside.id;

    // Jan 16, 00:00:00 Mexico City = 2026-01-16T06:00:00Z → NOT in Jan 15 local
    const after = await seedCashShift(prisma, rest.restaurant.id, rest.admin.id, {
      openedAt: new Date('2026-01-16T06:00:00.000Z'),
    });
    shiftAfterId = after.id;
  });

  it('?dateFrom=2026-01-15&dateTo=2026-01-15 incluye solo sesiones del día local', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history?dateFrom=2026-01-15&dateTo=2026-01-15')
      .set('Authorization', `Bearer ${tzToken}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain(shiftInDayId);
    expect(ids).not.toContain(shiftBeforeId);
    expect(ids).not.toContain(shiftAfterId);
  });

  it('?dateFrom=2026-01-15 excluye sesiones anteriores al inicio del día local', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history?dateFrom=2026-01-15')
      .set('Authorization', `Bearer ${tzToken}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).not.toContain(shiftBeforeId);
    expect(ids).toContain(shiftInDayId);
  });

  it('?dateTo=2026-01-15 excluye sesiones posteriores al fin del día local', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history?dateTo=2026-01-15')
      .set('Authorization', `Bearer ${tzToken}`)
      .expect(200);

    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).not.toContain(shiftAfterId);
    expect(ids).toContain(shiftBeforeId);
    expect(ids).toContain(shiftInDayId);
  });
});
```

- [ ] **Step 3: Run the e2e spec**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=sessionHistory
```

Expected: PASS — all existing tests plus the 3 new date-filter tests.

- [ ] **Step 4: Commit**

```bash
git add test/cash-register/cash-register.helpers.ts test/cash-register/sessionHistory.e2e-spec.ts
git commit -m "test(e2e): add timezone-aware date filter tests for cash-register session history"
```

---

## Task 6: Frontend — add date filter UI to register-history.astro

**Files:**
- Modify: `apps/ui/src/pages/dash/register-history.astro`

- [ ] **Step 1: Add filter UI before DataTable in the template**

In the Astro template (the `---` frontmatter block stays unchanged), add a filter row between `<h2>` and `<DataTable>`:

```astro
<h2 class="text-2xl font-bold text-slate-800">Historial de Caja</h2>

<!-- Filtros -->
<div class="bg-white rounded-xl border border-slate-200 p-4">
  <div class="flex flex-wrap gap-3 items-end">
    <div class="space-y-1">
      <label for="filterDateFrom" class="text-xs font-medium text-slate-600">Desde</label>
      <input id="filterDateFrom" type="date"
             class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
    <div class="space-y-1">
      <label for="filterDateTo" class="text-xs font-medium text-slate-600">Hasta</label>
      <input id="filterDateTo" type="date"
             class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
    <button id="searchBtn"
            class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 cursor-pointer border-none">
      Buscar
    </button>
    <button id="clearBtn"
            class="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer bg-transparent">
      Limpiar
    </button>
  </div>
</div>
```

- [ ] **Step 2: Add filter input references to the script**

In the `<script>` section, after the existing element references, add:

```ts
const filterDateFrom = document.getElementById('filterDateFrom') as HTMLInputElement;
const filterDateTo   = document.getElementById('filterDateTo') as HTMLInputElement;
```

- [ ] **Step 3: Update loadHistory to pass filter params**

Replace the `loadHistory` function (keep the rendering logic, only change the fetch call):

```ts
async function loadHistory(page = 1) {
  currentPage = page;
  setTableLoading(tableBody, COLSPAN);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '10');
  if (filterDateFrom.value) params.set('dateFrom', filterDateFrom.value);
  if (filterDateTo.value)   params.set('dateTo', filterDateTo.value);

  const res = await apiFetch(`/v1/cash-register/history?${params}`);
  // ... rest of the function body is unchanged
```

- [ ] **Step 4: Add event listeners at the end of the script**

Before `loadHistory(1);` at the bottom of the script, add:

```ts
document.getElementById('searchBtn')!.addEventListener('click', () => loadHistory(1));
document.getElementById('clearBtn')!.addEventListener('click', () => {
  filterDateFrom.value = '';
  filterDateTo.value = '';
  loadHistory(1);
});
[filterDateFrom, filterDateTo].forEach(input => {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadHistory(1); });
});
```

- [ ] **Step 5: Run all unit tests one final time**

```bash
cd apps/api-core && pnpm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/pages/dash/register-history.astro
git commit -m "feat(ui): add dateFrom/dateTo date filter to register history page"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Covered by |
|---|---|
| Repository accepts dateFrom/dateTo filter on openedAt | Task 2 |
| TimezoneService injected into CashRegisterService | Task 3 |
| toUtcBoundary applied to convert date strings to UTC | Task 3 |
| CashRegisterModule imports RestaurantsModule | Task 3 |
| Controller exposes dateFrom/dateTo query params | Task 4 |
| Unit tests for getSessionHistory date filtering (TDD) | Task 1 |
| E2E tests with non-UTC timezone boundary validation | Task 5 |
| Frontend date filter UI + API integration | Task 6 |

**Placeholder scan:** ✅ No TBDs. All code complete.

**Type consistency:**
- `findByRestaurantIdPaginated` gains 4th param `filters?` in Task 2; called with it in Task 3; mock called with it in Task 1 tests — ✅
- `getSessionHistory` signature extended with `dateFrom?`, `dateTo?` in Task 3; controller passes them in Task 4; tests use them in Task 1 — ✅
- `seedCashShift` created in Task 5 Step 1; imported and used in Step 2 — ✅
