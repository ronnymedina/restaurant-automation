# Cash Register Session Info Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Enforce a single global cash register session per restaurant — only one session open at a time, any user. (2) Expose who opened the session (`userId` + `email`) in the API response and display that info along with the session ID on the register page and the kitchen/orders page.

**Architecture:** Task 0 changes `openSession` to check for any open session restaurant-wide (removes per-user isolation). `closeSession` drops the userId filter. One e2e test expectation and two unit test assertions change. Tasks 1-4 add the `user` relation to Prisma queries and surface the data in the UI. No new columns or migrations are needed for the single-session change — only application-level query changes. The PostgreSQL partial unique index must be manually updated in prod (documented in Task 0).

**Tech Stack:** NestJS / Prisma (SQLite dev, PostgreSQL prod), Astro + Tailwind, class-transformer serializers.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `apps/api-core/src/cash-register/cash-register.service.ts` | Modify | `openSession` → global findOpen; `closeSession` → drop userId param + filter |
| `apps/api-core/src/cash-register/cash-register.controller.ts` | Modify | `close()` → 2-arg closeSession call |
| `apps/api-core/src/cash-register/cash-register.service.spec.ts` | Modify | Fix findOpen call assertion; remove userId-filter test from closeSession |
| `apps/api-core/test/cash-register/openSession.e2e-spec.ts` | Modify | `'MANAGER puede abrir su propia sesión'` → expect 409 |
| `apps/api-core/prisma/schema.prisma` | Modify | Update PostgreSQL index comment |
| `apps/api-core/prisma/schema.postgresql.prisma` | Modify | Update PostgreSQL index comment |
| `apps/api-core/src/cash-register/cash-register-session.repository.ts` | Modify | Add `user` include to `create`, `findOpenWithOrderCount`, `findById`; export `CashShiftWithUser` type |
| `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts` | Modify | Expose `userId` and `user` fields; update constructor type |
| `apps/api-core/src/cash-register/cash-register.module.info.md` | Modify | Update CashShiftDto; fix error codes; document single global session |
| `apps/ui/src/pages/dash/register.astro` | Modify | Add session-ID card and opener-email card in the open-state UI |
| `apps/ui/src/pages/dash/orders.astro` | Modify | Fetch `GET /v1/cash-register/current` on load; render a shift-info strip in the header |

---

### Task 0: Enforce single global session per restaurant

**Background:** The current model allows each user to have their own open session (`findOpen(restaurantId, userId)`). This creates an ambiguity: when an order is created, which open session does it belong to? The simplest fix — and the right call for now — is to allow only one open session per restaurant at any time, regardless of which user opened it. The authorization restriction (only ADMIN or MANAGER can open/close) is already in place.

**What changes in the logic:**
- `openSession`: calls `findOpen(restaurantId)` — no userId arg — so any existing open session blocks a new one.
- `closeSession`: the internal `findFirst` no longer filters by userId — any ADMIN/MANAGER can close the restaurant's session.
- The `userId` is still stored on the record (it's the creator), but it's not used as a uniqueness scope anymore.

**PostgreSQL prod note:** Drop the old partial index and recreate it scoped to `restaurantId` only:
```sql
DROP INDEX IF EXISTS "one_open_shift_per_user_per_restaurant";
CREATE UNIQUE INDEX "one_open_shift_per_restaurant" ON "CashShift"("restaurantId") WHERE status = 'OPEN';
```
This is a manual step (not a Prisma migration) — run it on the prod database during deployment.

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts`
- Modify: `apps/api-core/test/cash-register/openSession.e2e-spec.ts`
- Modify: `apps/api-core/prisma/schema.prisma`
- Modify: `apps/api-core/prisma/schema.postgresql.prisma`

- [ ] **Step 1: Run baseline tests**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register
```

Expected: all unit tests PASS. Establishes a clean baseline before changes.

- [ ] **Step 2: Update the two unit tests that will break**

In `apps/api-core/src/cash-register/cash-register.service.spec.ts`:

**Change 1** — in the `openSession / should create and return a new session` test, the assertion on `findOpen` currently expects two arguments. Change it to one:

```typescript
// Before:
expect(mockRegisterSessionRepository.findOpen).toHaveBeenCalledWith(
  'restaurant-uuid-1',
  'user-uuid-1',
);

// After:
expect(mockRegisterSessionRepository.findOpen).toHaveBeenCalledWith(
  'restaurant-uuid-1',
);
```

**Change 2** — remove the entire test `'should filter findFirst by userId when userId is provided'` from the `closeSession` describe block. This behavior no longer exists:

```typescript
// DELETE this entire test:
it('should filter findFirst by userId when userId is provided', async () => {
  // ...
});
```

- [ ] **Step 3: Run unit tests — confirm they now FAIL (tests are ahead of implementation)**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register
```

Expected: the `openSession` assertion test FAILS because `findOpen` is still called with two args.

- [ ] **Step 4: Update the service**

In `apps/api-core/src/cash-register/cash-register.service.ts`, apply two changes:

**Change 1** — `openSession`: remove `userId` from the `findOpen` call:

```typescript
// Before:
const existing = await this.registerSessionRepository.findOpen(restaurantId, userId);

// After:
const existing = await this.registerSessionRepository.findOpen(restaurantId);
```

**Change 2** — `closeSession`: remove the `userId` parameter and its use in the `findFirst` where clause:

```typescript
// Before:
async closeSession(restaurantId: string, closedBy?: string, userId?: string) {
  return this.prisma.$transaction(async (tx) => {
    const session = await tx.cashShift.findFirst({
      where: {
        restaurantId,
        status: CashShiftStatus.OPEN,
        ...(userId ? { userId } : {}),
      },
    });

// After:
async closeSession(restaurantId: string, closedBy?: string) {
  return this.prisma.$transaction(async (tx) => {
    const session = await tx.cashShift.findFirst({
      where: {
        restaurantId,
        status: CashShiftStatus.OPEN,
      },
    });
```

- [ ] **Step 5: Update the controller's close() method**

In `apps/api-core/src/cash-register/cash-register.controller.ts`, the `close` handler currently passes `user.id` three times. Remove the third argument:

```typescript
// Before:
const result = await this.registerService.closeSession(user.restaurantId, user.id, user.id);

// After:
const result = await this.registerService.closeSession(user.restaurantId, user.id);
```

- [ ] **Step 6: Run unit tests — must all pass now**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register
```

Expected: all unit tests PASS.

- [ ] **Step 7: Update the e2e test for the multi-user scenario**

In `apps/api-core/test/cash-register/openSession.e2e-spec.ts`, the test at line 67 currently expects a MANAGER to succeed while ADMIN has a session open. After this change, that attempt must return 409.

Change the test:

```typescript
// Before:
it('MANAGER puede abrir su propia sesión → 201', async () => {
  const res = await request(app.getHttpServer())
    .post('/v1/cash-register/open')
    .set('Authorization', `Bearer ${managerToken}`)
    .expect(201);

  expect(res.body.status).toBe('OPEN');
});

// After:
it('Con sesión global abierta → MANAGER recibe 409 REGISTER_ALREADY_OPEN', async () => {
  // adminToken already has an open session from the previous test
  const res = await request(app.getHttpServer())
    .post('/v1/cash-register/open')
    .set('Authorization', `Bearer ${managerToken}`)
    .expect(409);

  expect(res.body.code).toBe('REGISTER_ALREADY_OPEN');
});
```

- [ ] **Step 8: Run the openSession e2e test suite**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=openSession
```

Expected: all tests PASS, including the updated multi-user test.

- [ ] **Step 9: Update schema comments for the PostgreSQL index**

In `apps/api-core/prisma/schema.prisma`, find the comment before the `CashShift` model and replace it:

```prisma
// Note: In PostgreSQL, enforce one open shift per restaurant with a partial index.
// Run manually on prod: CREATE UNIQUE INDEX "one_open_shift_per_restaurant" ON "CashShift"("restaurantId") WHERE status = 'OPEN';
// SQLite does not support partial indexes; uniqueness is enforced at the application layer (openSession checks findOpen before creating).
model CashShift {
```

In `apps/api-core/prisma/schema.postgresql.prisma`, find the comment before the `CashShift` model and replace it:

```prisma
// PostgreSQL partial unique index must be created manually:
// CREATE UNIQUE INDEX "one_open_shift_per_restaurant" ON "CashShift"("restaurantId") WHERE status = 'OPEN';
// (Replaces the old per-user index "one_open_shift_per_user_per_restaurant" — drop it if it exists)
model CashShift {
```

- [ ] **Step 10: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts \
        apps/api-core/src/cash-register/cash-register.service.spec.ts \
        apps/api-core/test/cash-register/openSession.e2e-spec.ts \
        apps/api-core/prisma/schema.prisma \
        apps/api-core/prisma/schema.postgresql.prisma
git commit -m "feat(cash-register): enforce single global session per restaurant"
```

---

### Task 1: Add user include to repository queries

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register-session.repository.ts`

- [ ] **Step 1: Write a failing e2e check for the new `user` field**

Open `apps/api-core/test/cash-register/currentSession.e2e-spec.ts` and add a new test after the existing "Con sesión abierta" test:

```typescript
it('Con sesión abierta → respuesta incluye user.email del abridor', async () => {
  const restC = await seedRestaurant(prisma, 'C');
  const token = await login(app, restC.admin.email);
  await openCashShiftViaApi(app, token);

  const res = await request(app.getHttpServer())
    .get('/v1/cash-register/current')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  expect(res.body.userId).toBeDefined();
  expect(res.body.user).toBeDefined();
  expect(typeof res.body.user.email).toBe('string');
});
```

- [ ] **Step 2: Run the new test to confirm it fails**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=currentSession
```

Expected: FAIL — `res.body.user` is undefined.

- [ ] **Step 3: Update the repository**

Replace the full contents of `apps/api-core/src/cash-register/cash-register-session.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { CashShift, CashShiftStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type CashShiftWithUser = Prisma.CashShiftGetPayload<{
  include: { user: { select: { id: true; email: true } } };
}>;

export type CashShiftWithUserAndCount = Prisma.CashShiftGetPayload<{
  include: {
    user: { select: { id: true; email: true } };
    _count: { select: { orders: true } };
  };
}>;

const USER_SELECT = { id: true, email: true } as const;

@Injectable()
export class CashShiftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, userId: string): Promise<CashShiftWithUser> {
    return this.prisma.cashShift.create({
      data: { restaurantId, userId },
      include: { user: { select: USER_SELECT } },
    });
  }

  async findOpen(restaurantId: string): Promise<CashShift | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
    });
  }

  async findById(id: string): Promise<CashShiftWithUser | null> {
    return this.prisma.cashShift.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } },
    });
  }

  async close(
    id: string,
    data: { totalSales: number; totalOrders: number; closedBy?: string },
  ): Promise<CashShift> {
    return this.prisma.cashShift.update({
      where: { id },
      data: {
        status: CashShiftStatus.CLOSED,
        closedAt: new Date(),
        totalSales: data.totalSales,
        totalOrders: data.totalOrders,
        closedBy: data.closedBy,
      },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: CashShift[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.cashShift.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.cashShift.count({ where: { restaurantId } }),
    ]);
    return { data, total };
  }

  async findOpenWithOrderCount(restaurantId: string): Promise<CashShiftWithUserAndCount | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
      include: {
        _count: { select: { orders: true } },
        user: { select: USER_SELECT },
      },
    });
  }
}
```

Note: `findOpen` now takes only `restaurantId` (no optional userId) — its signature is simplified to match the new global-session model from Task 0.

- [ ] **Step 4: Run unit tests — they must still pass (repo is mocked)**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register
```

Expected: all unit tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register-session.repository.ts \
        apps/api-core/test/cash-register/currentSession.e2e-spec.ts
git commit -m "feat(cash-register): include user relation in repository queries"
```

---

### Task 2: Expose userId and user in CashShiftSerializer + update service type

**Files:**
- Modify: `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`

- [ ] **Step 1: Update the serializer**

Replace the full contents of `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts`:

```typescript
import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashShiftWithUser } from '../cash-register-session.repository';

@Exclude()
export class CashShiftSerializer implements Omit<CashShift, 'openingBalance' | 'totalSales'> {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  restaurantId: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @Expose()
  user?: { id: string; email: string } | null;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiProperty()
  @Expose()
  lastOrderNumber: number;

  @Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? Number(value) : 0))
  @ApiProperty()
  @Expose()
  openingBalance: number;

  @Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? Number(value) : null))
  @ApiPropertyOptional({ nullable: true })
  @Expose()
  totalSales: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  totalOrders: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedBy: string | null;

  @ApiProperty()
  @Expose()
  openedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedAt: Date | null;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  _count?: { orders: number };

  constructor(
    partial: Partial<
      CashShiftWithUser & { _count?: { orders: number }; user?: { id: string; email: string } | null }
    >,
  ) {
    Object.assign(this, partial);
  }
}
```

Key changes vs. before:
- `userId` removed from the `Omit` constraint — now it is `@Expose()`d.
- New `user?: { id: string; email: string } | null` field with `@Expose()`.
- Constructor type updated to accept `CashShiftWithUser`.

- [ ] **Step 2: Update openSession return type in service**

In `apps/api-core/src/cash-register/cash-register.service.ts`, update the import to add `CashShiftWithUser`:

```typescript
import { CashShiftRepository, CashShiftWithUser } from './cash-register-session.repository';
```

Change the `openSession` signature:

```typescript
// Before:
async openSession(restaurantId: string, userId: string): Promise<CashShift> {

// After:
async openSession(restaurantId: string, userId: string): Promise<CashShiftWithUser> {
```

Check whether `CashShift` is still needed from `@prisma/client` in this file. It is — the `Prisma.PrismaClientKnownRequestError` check uses `Prisma` from that same import. Keep the `CashShift` import only if it's still referenced elsewhere in the file; remove it if not.

- [ ] **Step 3: Run unit tests**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=cash-register
```

Expected: all unit tests PASS.

- [ ] **Step 4: Run the e2e test added in Task 1**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=currentSession
```

Expected: all tests PASS including the new `user.email` assertion.

- [ ] **Step 5: Run open-session e2e to confirm no regression**

```bash
cd apps/api-core && pnpm test:e2e -- --testPathPattern=openSession
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts \
        apps/api-core/src/cash-register/cash-register.service.ts
git commit -m "feat(cash-register): expose userId and user.email in CashShiftSerializer"
```

---

### Task 3: Update register.astro to show session ID and opener

**Files:**
- Modify: `apps/ui/src/pages/dash/register.astro`

- [ ] **Step 1: Add session-ID and opened-by cards to the open-state HTML**

In `apps/ui/src/pages/dash/register.astro`, locate the `statusEl.innerHTML` template inside the `else` branch (line ~60 — the branch that renders when `data.id` is present).

The current grid has 3 columns: Abierta desde, Pedidos, Último # de orden. Replace that grid block with a 2-row layout — first row for meta (ID + opened-by), second row for stats:

```typescript
statusEl.innerHTML = `
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
      <h3 class="text-xl font-semibold text-emerald-700">Caja Abierta</h3>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-slate-50 rounded-lg p-4">
        <p class="text-sm text-slate-500">ID de sesión</p>
        <p class="text-sm font-mono text-slate-700 break-all">${data.id}</p>
      </div>
      <div class="bg-slate-50 rounded-lg p-4">
        <p class="text-sm text-slate-500">Abierta por</p>
        <p class="text-lg font-semibold">${data.user?.email ?? '-'}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-slate-50 rounded-lg p-4">
        <p class="text-sm text-slate-500">Abierta desde</p>
        <p class="text-lg font-semibold">${openedAt}</p>
      </div>
      <div class="bg-slate-50 rounded-lg p-4">
        <p class="text-sm text-slate-500">Pedidos</p>
        <p class="text-lg font-semibold">${orderCount}</p>
      </div>
      <div class="bg-slate-50 rounded-lg p-4">
        <p class="text-sm text-slate-500">Último # de orden</p>
        <p class="text-lg font-semibold">${data.lastOrderNumber}</p>
      </div>
    </div>
    <button id="closeRegister" class="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer border-none">
      Cerrar Caja
    </button>
  </div>
`;
```

- [ ] **Step 2: Verify in browser**

Start the dev server (`pnpm dev` from root) and open `http://localhost:4321/dash/register`. Log in as ADMIN or MANAGER, open a register session, and confirm the page shows:
- The session UUID under "ID de sesión"
- The opener's email under "Abierta por"
- The three stat cards still visible below

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/pages/dash/register.astro
git commit -m "feat(ui/register): show session ID and opener email on open register"
```

---

### Task 4: Update orders.astro (kitchen) to show active session info

**Files:**
- Modify: `apps/ui/src/pages/dash/orders.astro`

- [ ] **Step 1: Add the shift-info strip to the HTML**

In `apps/ui/src/pages/dash/orders.astro`, find the header `<div class="flex items-center justify-between">` (lines ~9-11). Add an info strip immediately after the `</div>` closing that header:

```html
<!-- Shift info strip -->
<div id="shiftInfo" class="hidden bg-white rounded-xl border border-slate-200 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
  <span class="text-slate-400">Sesión:</span>
  <span id="shiftId" class="font-mono text-slate-700 text-xs"></span>
  <span class="text-slate-400">Cajero:</span>
  <span id="shiftUser" class="font-medium text-slate-700"></span>
</div>
```

- [ ] **Step 2: Add loadShiftInfo function to the script block**

In the `<script>` section, after the existing `const toast` variable declaration, add the element refs:

```typescript
const shiftInfo = document.getElementById('shiftInfo')!;
const shiftIdEl = document.getElementById('shiftId')!;
const shiftUserEl = document.getElementById('shiftUser')!;
```

Then add the `loadShiftInfo` function (place it before `loadOrders`):

```typescript
async function loadShiftInfo() {
  try {
    const res = await apiFetch('/v1/cash-register/current');
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.id) {
      shiftInfo.classList.add('hidden');
      return;
    }
    shiftIdEl.textContent = data.id;
    shiftUserEl.textContent = data.user?.email ?? data.userId ?? '-';
    shiftInfo.classList.remove('hidden');
  } catch {
    // non-critical — kitchen still works without shift banner
  }
}
```

- [ ] **Step 3: Call loadShiftInfo on page load and on SSE order events**

At the bottom of the `<script>` block, change:

```typescript
loadOrders();
```

to:

```typescript
loadShiftInfo();
loadOrders();
```

Also add `loadShiftInfo()` alongside `loadOrders()` in the SSE event listeners so the strip refreshes if the shift changes while the page is open:

```typescript
es.addEventListener(ORDER_EVENTS.NEW, () => { loadOrders(); loadShiftInfo(); });
es.addEventListener(ORDER_EVENTS.UPDATED, () => { loadOrders(); loadShiftInfo(); });
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:4321/dash/orders`. With an active register session open, confirm the shift strip appears below the "Cocina (KDS)" heading and shows the UUID and the opener's email. With no active session, confirm the strip is hidden.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/pages/dash/orders.astro
git commit -m "feat(ui/orders): display active shift ID and opener in kitchen header"
```

---

### Task 5: Update module info documentation

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.module.info.md`

- [ ] **Step 1: Update CashShiftDto example**

Find the `CashShiftDto` JSON block and replace it:

```json
{
  "id": "string",
  "restaurantId": "string",
  "userId": "string",
  "user": { "id": "string", "email": "string" },
  "status": "OPEN | CLOSED",
  "lastOrderNumber": 0,
  "openingBalance": 0.0,
  "openedAt": "ISO8601",
  "closedAt": "ISO8601 | null",
  "totalSales": 150.0,
  "totalOrders": 12,
  "closedBy": "string | null",
  "_count": { "orders": 12 }
}
```

(`_count` is only present in responses from `GET /current` and `GET /history`.)

- [ ] **Step 2: Fix error codes in the endpoint tables**

The actual exception error codes (from `cash-register.exceptions.ts`) differ from what was originally documented. Update all three:

| Endpoint | Old code in docs | Correct code |
|---|---|---|
| POST /open | `CASH_REGISTER_ALREADY_OPEN` | `REGISTER_ALREADY_OPEN` |
| POST /close | `NO_OPEN_CASH_REGISTER` | `NO_OPEN_REGISTER` |
| GET /summary/:id | `CASH_REGISTER_NOT_FOUND` | `REGISTER_NOT_FOUND` |

- [ ] **Step 3: Update session isolation notes**

Under "Notas de implementación", replace the old multi-session bullet with:

```
- Solo puede existir una sesión OPEN por restaurante a la vez (global). `openSession` llama a `findOpen(restaurantId)` — sin filtro de usuario — y lanza `REGISTER_ALREADY_OPEN` (409) si ya existe una sesión abierta, sin importar qué usuario la abrió. Cualquier ADMIN o MANAGER puede cerrarla.
- En PostgreSQL, la unicidad se refuerza con un partial index: CREATE UNIQUE INDEX "one_open_shift_per_restaurant" ON "CashShift"("restaurantId") WHERE status = 'OPEN'; — debe crearse manualmente (Prisma no lo gestiona).
- `userId` y `user.email` se incluyen en las respuestas de `POST /open`, `GET /current` y `GET /summary/:sessionId`. La respuesta de `POST /close` no incluye `user` (omitido de la transacción de cierre por simplicidad).
```

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.module.info.md
git commit -m "docs(cash-register): single global session model, update CashShiftDto and error codes"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Covered by |
|---|---|
| Single global session per restaurant — block second open regardless of user | Task 0 (service + e2e) |
| Any ADMIN/MANAGER can close the session (not just the opener) | Task 0 (closeSession removes userId filter) |
| Register page shows session ID | Task 3 |
| Register page shows who opened the register | Task 3 |
| Kitchen page shows session ID and opener | Task 4 |
| Module info updated | Task 5 |

**Placeholder scan:** No TBD/TODO patterns found.

**Type consistency:**
- `CashShiftWithUser` defined once in `cash-register-session.repository.ts`, imported by `cash-shift.serializer.ts` and `cash-register.service.ts`.
- `findOpen` signature simplified to `(restaurantId: string)` in both the repository and service — no optional `userId` argument remains.
- `closeSession` signature simplified to `(restaurantId: string, closedBy?: string)` — consistent between service and controller call-site.
- `user?: { id: string; email: string } | null` shape is consistent between repository typedef, serializer, and frontend access pattern (`data.user?.email`).
