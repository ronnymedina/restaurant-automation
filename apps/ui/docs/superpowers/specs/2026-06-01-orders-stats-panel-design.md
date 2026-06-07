# Orders Stats Panel — Design Spec

**Date:** 2026-06-01  
**Branch:** spec/restaurant-settings-update  
**Status:** Approved

---

## Overview

Add a live statistics panel to the Orders page (`/dash/orders`) that sits permanently above the Kanban board. The panel consumes the existing `GET /v1/cash-register/stats` endpoint (already used by the register flow) and updates automatically on SSE order events, with a manual refresh fallback.

---

## Scope

- New `OrderStatsPanel` React component inside `apps/ui/src/components/dash/orders/`
- Wired into `OrdersPanel.tsx` — rendered when `status === ORDERS_STATUS.OPEN`, above the kanban/filter views
- No new API endpoints; no new npm packages (CSS bars + inline SVG, no charting library)
- No changes to `ShiftSummaryView`, register, or history flows

---

## Data Source

**Endpoint:** `GET /v1/cash-register/stats`  
**Function:** `getLiveStats()` — already defined in `apps/ui/src/components/dash/register/api.ts`  
**Returns:** `LiveStatsResult { summary: ShiftSummary }`

Fields used by the panel:

| Field | Displayed as |
|---|---|
| `revenue.completed` | Ingresos (green tile) |
| `revenue.pending` | Pendiente cobro (yellow tile) |
| `counts.total` | Total pedidos (blue tile) |
| `revenue.averageTicket` | Ticket promedio (light blue tile) |
| `topProducts` (top 5) | Horizontal bar chart, sorted by quantity desc |

`getLiveStats` will be imported from `register/api.ts` directly — no duplication.

---

## Component: `OrderStatsPanel`

**File:** `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`

### Props

None. `getLiveStats()` takes no arguments — stats are session-scoped server-side via JWT. The component receives a forwarded ref for the refresh handle (see SSE coordination below).

### Internal state

| State | Type | Purpose |
|---|---|---|
| `stats` | `ShiftSummary \| null` | Current data; null = not yet loaded |
| `loading` | `boolean` | True while fetching; disables refresh button and shows skeleton |
| `lastUpdated` | `Date \| null` | Timestamp of last successful fetch; shown as "Hace N min" |
| `error` | `string \| null` | Non-blocking error shown as small text below the header |

### Behavior

1. **Mount:** fetches stats immediately via `getLiveStats()`
2. **SSE trigger:** `OrdersPanel` already has an SSE connection for order events. On `ORDER_EVENTS.NEW` or `ORDER_EVENTS.UPDATED`, it calls `fetchOrders()`. The stats panel exposes a `refresh()` via `useImperativeHandle` so `OrdersPanel` can call it on the same events without a second SSE connection.
3. **Manual refresh:** clicking `↻ Actualizar` calls `getLiveStats()` again; button is disabled and shows spinner while in-flight; panel shows skeleton tiles.
4. **Timestamp:** after each successful fetch, `lastUpdated` is set to `new Date()`. Displayed as "Hace N min" (rounded to 1 min, shows "Ahora" if < 60s).
5. **Error:** on fetch failure, existing data stays visible; a small non-blocking error message appears under the header row (e.g. "No se pudo actualizar"). Does not blank the panel.
6. **No session = panel hidden:** `OrderStatsPanel` is only rendered when `status === ORDERS_STATUS.OPEN`, so no need for internal closed-state handling.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ESTADÍSTICAS EN VIVO        ● Hace 2 min   [↻ Actualizar]  │
│                                                             │
│  ┌──────────┬──────────┐  ┌────────────────────────────┐   │
│  │  $1,240  │   $180   │  │ TOP PRODUCTOS              │   │
│  │ Ingresos │ Pendiente│  │ Hamburguesa ████████  8    │   │
│  ├──────────┼──────────┤  │ Pizza       ██████    6    │   │
│  │    23    │  $53.9   │  │ Papas       █████     5    │   │
│  │  Pedidos │  Ticket  │  │ Refresco    ████      4    │   │
│  └──────────┴──────────┘  │ Limonada    ███       3    │   │
│                            └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- Grid: `grid-template-columns: 1fr 1.6fr` with `align-items: stretch`
- KPI left: `grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr` — tiles grow to match the height of the products panel
- Top products: CSS horizontal bars, width = `(quantity / maxQuantity) * 100%`, gradient `#3b82f6 → #60a5fa`
- Max 5 products shown; sorted by quantity descending (backend already returns sorted)

### Loading skeleton

While `loading === true`: KPI tiles and products panel render as `bg-slate-100 animate-pulse` placeholders at the same grid positions. Existing data is hidden (replaced by skeleton), not shown stale underneath.

---

## Refresh coordination with OrdersPanel SSE

`OrdersPanel` manages the SSE connection. Rather than opening a second connection, `OrderStatsPanel` exposes a `refresh` ref handle:

```ts
// OrderStatsPanel.tsx — wraps with React.forwardRef
useImperativeHandle(ref, () => ({ refresh: fetchStats }));

// OrdersPanel.tsx
const statsPanelRef = useRef<{ refresh: () => void }>(null);
// inside the SSE reload callback:
statsPanelRef.current?.refresh();
```

This keeps a single SSE connection while both the order list and the stats panel stay in sync.

---

## Files Changed

| File | Change |
|---|---|
| `orders/OrderStatsPanel.tsx` | New component |
| `orders/OrdersPanel.tsx` | Import and render `OrderStatsPanel` above kanban; wire SSE reload to `statsPanelRef.current?.refresh()` |
| `register/api.ts` | No change — `getLiveStats` imported as-is |

---

## Out of Scope

- No payment method breakdown chart (opted for B, not C)
- No order type breakdown chart
- No collapsible toggle — panel is always visible
- No new npm packages
