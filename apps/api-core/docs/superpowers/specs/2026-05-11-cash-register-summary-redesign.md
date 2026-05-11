# Cash Register Summary Redesign

**Date:** 2026-05-11
**Scope:** `apps/api-core/src/cash-register/` + `apps/ui/src/components/dash/register/api.ts`

## Problem

The cash register summary endpoints calculate `totalSales` and `paymentBreakdown` over **all** orders in a session regardless of status — including `CREATED` (pending), `PROCESSING` (in kitchen), and `CANCELLED`. This inflates reported totals with money that was never collected.

---

## Changes

### 1. `POST /cash-register/close` — fix totalSales

**File:** `cash-register.service.ts` → `closeSession()`

- Change the `order.aggregate` and `order.groupBy` queries to filter `status: OrderStatus.COMPLETED` only.
- `totalSales` persisted on `cashShift` reflects only completed (paid) orders.
- `totalOrders` persisted on `cashShift` reflects only completed orders count.
- Response shape is unchanged: `{ session, summary: { totalOrders, totalSales, paymentBreakdown } }`.

### 2. `GET /cash-register/summary/:sessionId` — redesign breakdown

**File:** `cash-register.service.ts` → `getSessionSummary()`

Replace the current in-memory loop aggregation with a single Prisma `groupBy` on `status`:

```ts
prisma.order.groupBy({
  by: ['status'],
  where: { cashShiftId: session.id },
  _sum: { totalAmount: true },
  _count: { id: true },
})
```

**New response shape for `summary`:**

```ts
{
  ordersByStatus: {
    CREATED:    { count: number; total: number };
    PROCESSING: { count: number; total: number };
    COMPLETED:  { count: number; total: number };
    CANCELLED:  { count: number; total: number };
  };
  totalSales: number;          // CREATED + PROCESSING + COMPLETED (excludes CANCELLED)
  totalOrders: number;         // all orders in session
  paymentBreakdown: Record<string, { count: number; total: number }>; // COMPLETED only
  // topProducts removed — moved to dedicated endpoint
}
```

- Remove `completedOrders` and `cancelledOrders` flat fields (replaced by `ordersByStatus`).
- Remove `topProducts` from this response.
- The `orders` array (full order list) stays in the response unchanged.
- `paymentBreakdown` is computed only from `COMPLETED` orders via a filtered `groupBy`.

### 3. New endpoint — `GET /cash-register/top-products/:sessionId`

Extract top-products logic from `getSessionSummary` into a dedicated service method and controller action.

**Service:** `getTopProducts(sessionId: string)`
- Runs the existing `orderItem.groupBy` query (exclude `CANCELLED` orders).
- Returns top 5 products by quantity.
- Throws `CashRegisterNotFoundException` if session not found.

**Controller:**
```ts
@Get('top-products/:sessionId')
async topProducts(@Param('sessionId') sessionId: string) { ... }
```

**Response:**
```ts
{
  topProducts: Array<{ id: string; name: string; quantity: number; total: number }>;
}
```

### 4. Frontend types — `apps/ui/src/components/dash/register/api.ts`

Update `SessionDetailSummary` to match the new API response:

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
```

Remove `completedOrders`, `cancelledOrders`, and `topProducts` from this interface.

Add a new `getTopProducts(sessionId: string)` API function that calls `GET /v1/cash-register/top-products/:sessionId`.

---

## Files Changed

| File | Change |
|------|--------|
| `cash-register.service.ts` | Fix `closeSession` queries; redesign `getSessionSummary`; add `getTopProducts` |
| `cash-register.controller.ts` | Add `GET top-products/:sessionId` route |
| `cash-register-session.repository.ts` | No changes needed |
| `order.repository.ts` | No changes needed |
| `dto/cash-register-response.dto.ts` | Update `SessionSummaryResponseDto` to reflect new shape |
| `apps/ui/.../register/api.ts` | Update `SessionDetailSummary`; add `getTopProducts` function |

---

## Out of Scope

- Changes to `GET /cash-register/current` — used only to check open/closed state, no summary needed.
- Changes to `GET /cash-register/history` — returns the session list, not order details.
- UI component changes (RegisterSummaryModal, RegisterHistoryIsland) — handled separately once API is stable.
