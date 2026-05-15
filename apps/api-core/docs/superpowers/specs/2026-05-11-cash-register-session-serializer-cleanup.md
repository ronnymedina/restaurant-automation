# Cash Register Session Serializer Cleanup

**Date:** 2026-05-11
**Scope:** `apps/api-core/src/cash-register/` + `apps/ui/src/components/dash/register/`

## Problem

After the summary redesign (`2026-05-11-cash-register-summary-redesign.md`), the session object (`CashShiftSerializer`) still exposes fields that are either redundant, confusing, or incorrectly shaped. Several issues were reported in the `register-history` page:

1. `session.totalOrders` and `session.totalSales` appear `null` in some contexts because these fields only have values after a session is CLOSED; the real computed summary now lives in the `summary` object from `GET /cash-register/summary/:sessionId`.
2. `openedAt` and `closedAt` display in UTC — needs to verify the timezone pipeline is working end-to-end.
3. `openingBalance` is exposed but never used functionally (no UI input, defaults to 0).
4. `restaurantId` is unnecessarily included in every session response.
5. `lastOrderNumber` is included but serves no purpose in the client views.
6. `paymentBreakdown` is a keyed object (`Record<string, { count, total }>`) — the consumer has to `Object.entries()` it; an array is a cleaner contract.

---

## Changes

### 1. `CashShiftSerializer` — remove unused / redundant fields

**File:** `serializers/cash-shift.serializer.ts`

Remove `@Expose()` from:
- `restaurantId`
- `lastOrderNumber`
- `openingBalance`
- `totalSales` — already present in `summary.totalSales`; null for OPEN sessions causing confusion
- `totalOrders` — already present in `summary.totalOrders`; null for OPEN sessions causing confusion

The history table currently reads `session.totalSales` and `session.totalOrders ?? _count.orders`. After removing these:
- **Order count column**: use `_count.orders` only (already the first fallback, always present).
- **Total sales column**: remove from the history list — per-row sales are only meaningful on the detail modal, which reads from `summary`.

Resulting exposed fields on `CashShiftSerializer`:

| Field | Notes |
|-------|-------|
| `id` | |
| `status` | `OPEN` \| `CLOSED` |
| `displayOpenedAt` | formatted datetime string in restaurant timezone (see §2) |
| `displayClosedAt` | formatted datetime string \| null |
| `closedBy` | string \| null |
| `openedByEmail` | derived from `user.email` |
| `_count` | optional `{ orders: number }` |

Fields **removed from response**: `restaurantId`, `lastOrderNumber`, `openingBalance`, `totalSales`, `totalOrders`, `userId`, raw `openedAt`, raw `closedAt`.

---

### 2. `paymentBreakdown` — change to array

**Files:**
- `serializers/session-summary.serializer.ts` → `serializePaymentBreakdown()`
- `dto/cash-register-response.dto.ts` → `SessionSummaryDto`, `CloseSummary`
- `apps/ui/src/components/dash/register/api.ts` → `PaymentMethodInfo` / `CloseSummary` / `SessionDetailSummary`
- `apps/ui/src/components/dash/register/RegisterHistoryIsland.tsx` → render loop

**Current shape (object):**
```ts
paymentBreakdown: {
  CASH: { count: 3, total: 150.00 },
  CARD: { count: 2, total: 80.00 }
}
```

**New shape (array):**
```ts
paymentBreakdown: [
  { method: 'CASH', count: 3, total: 150.00 },
  { method: 'CARD', count: 2, total: 80.00 }
]
```

**Serializer change:**
```ts
function serializePaymentBreakdown(
  breakdown: Record<string, { count: number; total: bigint }>,
): Array<{ method: string; count: number; total: number }> {
  return Object.entries(breakdown).map(([method, val]) => ({
    method,
    count: val.count,
    total: fromCents(val.total),
  }));
}
```

This affects both endpoints that return `paymentBreakdown`:
- `POST /cash-register/close` → `summary.paymentBreakdown`
- `GET /cash-register/summary/:sessionId` → `summary.paymentBreakdown`

---

### 3. Dates / timezone — backend transformation (same pattern as kitchen)

Follow the pattern in `KitchenOrderSerializer` / `kitchen.service.ts`: inject `TimezoneService`, get the restaurant timezone in the controller, and pass it to the serializer.

**`CashShiftSerializer` constructor:**

Target format: `"7 may 2026, 22:44"` — day numeric, month short, year numeric, 24h HH:MM.

```ts
constructor(
  partial: Partial<CashShiftWithUser & { _count?: { orders: number } }>,
  timezone = 'UTC',
) {
  Object.assign(this, partial);
  const fmt = new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  this.displayOpenedAt = fmt.format(new Date(partial.openedAt!));
  this.displayClosedAt = partial.closedAt ? fmt.format(new Date(partial.closedAt)) : null;
  this.openedByEmail = (partial as any).user?.email ?? null;
}
```

Raw `openedAt` and `closedAt` are **not exposed** — only `displayOpenedAt` / `displayClosedAt` are sent.

**`CashRegisterModule`** — import `RestaurantsModule` (which exports `TimezoneService`):

```ts
@Module({
  imports: [OrdersModule, RestaurantsModule],
  ...
})
```

**`CashRegisterController`** — inject `TimezoneService` and pass timezone when constructing serializers:

```ts
constructor(
  private readonly registerService: CashRegisterService,
  private readonly timezoneService: TimezoneService,
) {}

// On every endpoint that returns a CashShiftSerializer:
const tz = await this.timezoneService.getTimezone(user.restaurantId);
return new CashShiftSerializer(session, tz);
```

Endpoints affected: `open`, `close`, `history`, `current`, `summary/:sessionId`.

**Frontend** — replace `formatDate(session.openedAt, timezone)` / `formatDate(session.closedAt, timezone)` with direct use of `session.displayOpenedAt` / `session.displayClosedAt` (already a formatted string; no timezone conversion needed client-side).

Update `CashShiftDto` in `apps/ui/src/components/dash/register/api.ts`:
```ts
// Remove:
openedAt: string;
closedAt: string | null;

// Add:
displayOpenedAt: string;
displayClosedAt: string | null;
```

---

### 4. `openingBalance` — what it is and why it's removed

`openingBalance` represents the initial cash in the register drawer at shift open (e.g. $500 float). It exists in the DB schema but:
- Is never collected from the user (no UI input at open)
- Always defaults to `0n` (zero cents)
- Is not displayed anywhere in the UI

**Action:** Remove `@Expose()` from `CashShiftSerializer.openingBalance`. The field stays in the DB schema for future use when the feature is properly implemented.

---

### 5. `GET /summary/:sessionId` — replace `ordersByStatus` with `completed` / `cancelled`

#### Business rules confirmed

- `closeSession` blocks if any order is in `CREATED` or `PROCESSING` (`PendingOrdersException`).
- Therefore, a **CLOSED session can only contain `COMPLETED` and `CANCELLED` orders**.
- `CANCELLED` = refund model: the money was returned to the customer and must not appear in the register total.
- "Paid but not picked up" is **not a cancellation** — the operator must mark those orders as `COMPLETED`. No new status is needed; this is an operational discipline enforced by clear UI confirmation dialogs (out of scope here).

#### New summary shape — two groups only

| Field | Status source | What it represents |
|-------|--------------|-------------------|
| `completed` | `COMPLETED` | Orders delivered; money is in the register |
| `cancelled` | `CANCELLED` | Orders refunded; count shown for reference, **no total** |

`CREATED` and `PROCESSING` are structurally impossible in a closed session. They are ignored in this response.

**Backend — `getSessionSummary` service:**

```ts
const completedGroup = statusGroups.find(g => g.status === OrderStatus.COMPLETED);
const cancelledGroup = statusGroups.find(g => g.status === OrderStatus.CANCELLED);

const completed = {
  count: completedGroup?._count.id ?? 0,
  total: completedGroup?._sum.totalAmount ?? 0n,
};
const cancelled = {
  count: cancelledGroup?._count.id ?? 0,
  // no total — money was refunded
};
```

Return value:
```ts
return {
  session,
  summary: { completed, cancelled, paymentBreakdown },
};
// totalSales, totalOrders, ordersByStatus removed
```

**Backend — `serializeSessionSummary`:**

```ts
export function serializeSessionSummary(summary: {
  completed: { count: number; total: bigint };
  cancelled: { count: number };
  paymentBreakdown: Record<string, { count: number; total: bigint }>;
}) {
  return {
    completed: { count: summary.completed.count, total: fromCents(summary.completed.total) },
    cancelled: { count: summary.cancelled.count },
    paymentBreakdown: serializePaymentBreakdown(summary.paymentBreakdown),
  };
}
```

**Backend DTO — `NewSessionSummaryDto`:**

```ts
export class CompletedGroupDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class CancelledGroupDto {
  @ApiProperty() count: number;
}

export class NewSessionSummaryDto {
  @ApiProperty({ type: CompletedGroupDto }) completed: CompletedGroupDto;
  @ApiProperty({ type: CancelledGroupDto }) cancelled: CancelledGroupDto;
  @ApiProperty({ type: [PaymentBreakdownItemDto] }) paymentBreakdown: PaymentBreakdownItemDto[];
}
```

Remove `OrdersByStatusDto`, `OrderStatusGroupDto`, `totalSales`, `totalOrders` from this DTO.

---

### 6. UI type and render updates

**File:** `apps/ui/src/components/dash/register/api.ts`

```ts
export interface PaymentBreakdownItem {
  method: string;
  count: number;
  total: number;
}

export interface OrderGroup {
  count: number;
  total: number;
}

export interface CashShiftDto {
  id: string;
  status: CashShiftStatus;
  displayOpenedAt: string;        // formatted in restaurant tz — "7 may 2026, 22:44"
  displayClosedAt: string | null;
  closedBy: string | null;
  openedByEmail: string | null;
  _count?: { orders: number };
  // removed: restaurantId, userId, lastOrderNumber, openingBalance,
  //          totalSales, totalOrders, openedAt, closedAt
}

export interface CloseSummary {
  totalOrders: number;
  totalSales: number;
  paymentBreakdown: PaymentBreakdownItem[];
}

export interface SessionDetailSummary {
  completed: { count: number; total: number }; // COMPLETED orders — money in register
  cancelled: { count: number };               // CANCELLED orders — refunded, no total
  paymentBreakdown: PaymentBreakdownItem[];
}
```

**File:** `apps/ui/src/components/dash/register/RegisterHistoryIsland.tsx`

- `displayOpenedAt`/`displayClosedAt` replace `formatDate(session.openedAt, timezone)` — render directly as strings.
- Remove `totalSales` column from the history table; order count column uses `row.original._count?.orders ?? 0`.
- Remove `timezone` state and `getRestaurantTimezone()` usage.
- Replace the 4-card stats grid with a 2-card grid:

```tsx
const { session, summary } = detail;

<div className="grid grid-cols-2 gap-3">
  <div className="bg-emerald-50 rounded-lg p-4 text-center">
    <p className="text-lg font-bold text-emerald-700">{formatCurrency(summary.completed.total)}</p>
    <p className="text-sm text-emerald-600">{summary.completed.count} pedidos completados</p>
  </div>
  <div className="bg-red-50 rounded-lg p-4 text-center">
    <p className="text-lg font-bold text-red-600">{summary.cancelled.count}</p>
    <p className="text-sm text-red-500">pedidos cancelados</p>
  </div>
</div>
```

- `paymentBreakdown` render — iterate array:

```tsx
summary.paymentBreakdown.map((item) => (
  <div key={item.method} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-slate-600">{PAYMENT_LABELS[item.method] ?? item.method}</span>
    <span className="text-slate-800 font-medium">
      {item.count} pedidos — {formatCurrency(item.total)}
    </span>
  </div>
))
```

---

## Files Changed

| File | Change |
|------|--------|
| `cash-register.module.ts` | Import `RestaurantsModule` to expose `TimezoneService` |
| `cash-register.controller.ts` | Inject `TimezoneService`; pass `tz` to every `new CashShiftSerializer(...)` call |
| `serializers/cash-shift.serializer.ts` | Remove stale fields; add `displayOpenedAt`/`displayClosedAt` computed in constructor |
| `serializers/session-summary.serializer.ts` | `serializePaymentBreakdown` → array; `serializeSessionSummary` → `{ completed, cancelled, paymentBreakdown }` |
| `dto/cash-register-response.dto.ts` | Replace `OrdersByStatusDto`/`OrderStatusGroupDto` with `CompletedGroupDto`/`CancelledGroupDto`; update `NewSessionSummaryDto`; `paymentBreakdown` as array |
| `cash-register.service.ts` | `getSessionSummary` — derive `completed`/`cancelled` from status groups; remove `ordersByStatus`, `totalSales`, `totalOrders` |
| `apps/ui/.../register/api.ts` | Rewrite `CashShiftDto`; add `PaymentBreakdownItem`; update `SessionDetailSummary` to `{ completed, cancelled, paymentBreakdown }` |
| `apps/ui/.../register/RegisterHistoryIsland.tsx` | Use `displayOpenedAt`/`displayClosedAt`; remove `totalSales` column; 2-card stats grid; array `paymentBreakdown`; remove timezone state |

---

## Out of Scope

- Adding a UI input for `openingBalance` at shift open — future feature.
- `POST /close` summary shape — stays as `{ totalOrders, totalSales, paymentBreakdown }` (already COMPLETED-only).
- Changes to `GET /cash-register/history` pagination or query shape.
- Changes to `GET /cash-register/top-products/:sessionId`.
- CANCELLED orders breakdown — not shown to the user in either group.
