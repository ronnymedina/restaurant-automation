# Orders KDS Redesign

**Date:** 2026-05-13
**Scope:** `apps/api-core` (API changes) + `apps/ui` (frontend refactor)

---

## Problem

The current `/dash/orders` page has three issues:

1. **No session gating** — orders load even when the cash register is closed. Staff see stale data with no context.
2. **No session identity** — the shift info banner is cosmetic and optional; there is no clear indication of which session is active or who opened it.
3. **Monolithic page** — all logic is inline `<script>` in an Astro file. No components, no tests.

---

## Goals

- Gate the KDS entirely on an active cash session: no session → no orders, clear closed message.
- Show the active session ID and the email of the user who opened the cash register.
- Scope displayed orders to the current session (`cashShiftId`).
- Allow filtering by order number and status without the kanban becoming noise.
- Cap at 30 orders with a visible note.
- Migrate to React components following the `register.astro` pattern.

---

## Backend — `apps/api-core`

### Changes to `GET /v1/orders`

Add two optional query parameters:

| Param | Type | Behavior |
|---|---|---|
| `cashShiftId` | `string` | Scope results to orders in that shift. Must belong to user's restaurant (enforced by existing `restaurantId` scoping). |
| `orderNumber` | `number` | Exact match on `orderNumber`. |
| `limit` | `number` | Cap raised from **15 → 30**. |
| `status` | `OrderStatus` | Unchanged. |

**Files touched:**

- `src/orders/orders.controller.ts` — add `@Query('cashShiftId')` and `@Query('orderNumber')`; update Swagger `@ApiQuery` annotations.
- `src/orders/orders.service.ts` — pass `cashShiftId` and `orderNumber` to the repository.
- `src/orders/order.repository.ts` — extend `findByRestaurantId` `where` clause:

```ts
...(cashShiftId ? { cashShiftId } : {}),
...(orderNumber ? { orderNumber } : {}),
```

No new endpoints, no schema changes.

### Permission fix — `GET /v1/cash-register/current`

This endpoint is currently restricted to `ADMIN` and `MANAGER`. Since the new frontend gates the entire orders page on calling this endpoint, a BASIC user would receive a 403 and land in the `ERROR` state instead of seeing orders.

Fix: add `@Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)` to the `current` handler in `cash-register.controller.ts`. The endpoint is read-only — BASIC users can see the active session identity but cannot open or close cash.

### E2E Tests — `test/orders/listOrders.e2e-spec.ts`

Seed two cash shifts for restaurant A (`shiftA`, `shiftB`). Add cases:

| # | Test | Assertion |
|---|---|---|
| 1 | `?cashShiftId=shiftA` | Returns only shiftA orders |
| 2 | `?cashShiftId=shiftB` | Returns only shiftB orders |
| 3 | `?cashShiftId=<shiftFromRestB>` | Returns empty array (cross-restaurant isolation) |
| 4 | `?orderNumber=1` | Returns only the order with `orderNumber=1` |
| 5 | `?cashShiftId=shiftA&orderNumber=1` | Combined filter works correctly |
| 6 | `?limit=500` | Response length ≤ 30 (existing test updated from 15 → 30) |

`orders.helpers.ts` already has `openCashShift` and `seedOrder` — no new helpers needed.

---

## Frontend — `apps/ui`

### Page shell

`pages/dash/orders.astro` becomes a thin wrapper identical to `register.astro`:

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

### Component tree

```
components/dash/orders/
  OrdersPanel.tsx          Root: checks session, renders gated states
  OrdersKanban.tsx         2-col primary + collapsible secondary
  OrderCard.tsx            Single order card with action buttons
  OrderFilterPanel.tsx     Sidebar: order number input + status checkboxes
  OrdersFilteredList.tsx   Flat list rendered when a filter is active
  CancelOrderModal.tsx     Cancel confirmation modal (extracted from inline)
  api.ts                   Typed fetch wrappers (getCurrentSession, getOrders, etc.)
  types.ts                 Shared types and constants
```

### Session states (`OrdersPanel`)

`OrdersPanel` loads the current session on mount and branches into one of four states:

| State | Trigger | What renders |
|---|---|---|
| `LOADING` | Initial mount | Skeleton / spinner |
| `CLOSED` | `GET /v1/cash-register/current` returns `{}` | Closed message: "La caja está cerrada. Abre una sesión para ver los pedidos." |
| `ERROR` | Network / 403 | Error message |
| `OPEN` | Session has `id` | Session banner + kanban or filtered list |

When `OPEN`, the session banner shows:
- Session ID (masked by default, toggle to reveal — same eye icon pattern as current page)
- Email of the user who opened the session (`data.user.email`)
- "máx. 30 pedidos" note

### Layout — Kanban mode (no active filter)

Two primary columns at full width:

```
[ CREATED (n) ]  [ PROCESSING (n) ]
─────────────────────────────────────
▼ Completado (n)   Cancelado (n)    ← collapsed bar, click to expand
```

Secondary bar shows counts inline. Clicking expands to show a 2-column row below the primary columns.

### Layout — Filter mode (filter applied)

When the filter panel has any value applied, the kanban is replaced by a flat list:

```
[ ✕ Filtro activo: En Proceso ]   2 resultados

#11  Tacos x3          En Proceso   $15.00
#9   Sopa x2           En Proceso   $9.50
```

Clearing the filter returns to kanban mode. The filter button in the session banner changes color when active.

### Filter panel (`OrderFilterPanel`)

Slides in as a sidebar (right edge). Contents:

- **N° de pedido** — number input, triggers combined `cashShiftId + orderNumber` query
- **Estado** — checkboxes: CREATED, PROCESSING, COMPLETED, CANCELLED (multi-select)
- **Aplicar** button — triggers fetch with active filters
- **Limpiar** button — resets all, returns to kanban

### Data loading rules

- On mount: fetch `/v1/cash-register/current` first.
- If session is open: fetch `/v1/orders?cashShiftId=<id>&limit=30`.
- If no session: stop. Do not call `/v1/orders`.
- Filters are applied as additional query params on the same endpoint.
- SSE (`ORDER_EVENTS.NEW`, `ORDER_EVENTS.UPDATED`) still triggers reload when in kanban mode. In filter mode, SSE is ignored to avoid clobbering the user's active search.

### Order card actions (unchanged behavior)

- **Procesar** (CREATED → PROCESSING)
- **Completar** (PROCESSING → COMPLETED, requires `isPaid`)
- **Marcar Pagado**
- **Cancelar** (opens `CancelOrderModal`)
- **Recibo**

### `api.ts` typed wrappers

```ts
getOrders(params: { cashShiftId?: string; orderNumber?: number; status?: string; limit?: number })
updateOrderStatus(id: string, status: string)
markOrderPaid(id: string)
cancelOrder(id: string, reason: string)
```

---

## Out of scope

- Pagination beyond 30 (deferred)
- Filtering by date range (available in `/v1/orders/history`, not needed here)
- New SSE events (existing ORDER_EVENTS are sufficient)
- Backend unit tests for the new filter params (thin controller/repo changes; e2e coverage is sufficient)
