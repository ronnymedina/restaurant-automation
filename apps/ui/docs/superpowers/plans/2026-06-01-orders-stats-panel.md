# Orders Stats Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live statistics panel above the Kanban board in the Orders page that shows revenue KPIs and top products, refreshes on SSE order events, and supports manual refresh.

**Architecture:** A new `OrderStatsPanel` React component (with `forwardRef`) is rendered inside `OrdersPanel` above the Kanban/filter. `OrdersPanel` already manages the SSE connection — it calls `statsPanelRef.current?.refresh()` on order events, keeping a single SSE connection. Stats are fetched via the existing `getLiveStats()` from `register/api.ts`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS. No new npm packages — CSS bars + inline gradient. Vitest + React Testing Library for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx` | Create | Stats panel component: fetch, KPI tiles, bar chart, refresh button |
| `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx` | Create | Unit tests for `OrderStatsPanel` |
| `apps/ui/src/components/dash/orders/OrdersPanel.tsx` | Modify | Wire `OrderStatsPanel` into the page layout and SSE reload |

---

## Task 1: Create `OrderStatsPanel` — fetch, loading skeleton, KPI tiles

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`
- Create: `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { createRef } from 'react';
import OrderStatsPanel, { type OrderStatsPanelHandle } from './OrderStatsPanel';
import * as registerApi from '../register/api';

vi.mock('../register/api');

export const mockSummary = {
  counts: {
    total: 23, pending: 5, created: 2, confirmed: 1,
    processing: 1, served: 1, completed: 18, cancelled: 2,
  },
  revenue: { completed: 1240.00, pending: 180.00, averageTicket: 53.91 },
  byPaymentMethod: [],
  byOrderType: [],
  byOrderSource: [],
  topProducts: [
    { id: '1', name: 'Hamburguesa clásica', quantity: 8, total: 280 },
    { id: '2', name: 'Pizza pepperoni',    quantity: 6, total: 210 },
    { id: '3', name: 'Papas fritas',       quantity: 5, total: 75  },
    { id: '4', name: 'Refresco grande',    quantity: 4, total: 40  },
    { id: '5', name: 'Limonada natural',   quantity: 3, total: 45  },
  ],
};

beforeEach(() => {
  vi.mocked(registerApi.getLiveStats).mockResolvedValue({
    ok: true,
    data: { summary: mockSummary },
  });
});

afterEach(() => vi.clearAllMocks());

test('shows loading skeleton while fetching', () => {
  vi.mocked(registerApi.getLiveStats).mockReturnValue(new Promise(() => {}));
  render(<OrderStatsPanel />);
  // Skeleton: 4 tile placeholders + bar placeholders; no revenue values shown
  expect(screen.queryByText('$1,240.00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
});

test('renders KPI tiles after successful fetch', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('$1,240.00')).toBeInTheDocument());
  expect(screen.getByText('$180.00')).toBeInTheDocument();
  expect(screen.getByText('23')).toBeInTheDocument();
  expect(screen.getByText('$53.91')).toBeInTheDocument();
});

test('renders top products bar chart after fetch', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('Hamburguesa clásica')).toBeInTheDocument());
  expect(screen.getByText('Pizza pepperoni')).toBeInTheDocument();
  expect(screen.getByText('8 uds.')).toBeInTheDocument();
  expect(screen.getByText('6 uds.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-ui pnpm test -- OrderStatsPanel --reporter=verbose
```

Expected: 3 failures — `OrderStatsPanel` does not exist yet.

- [ ] **Step 3: Create `OrderStatsPanel.tsx` with fetch, state, KPI tiles, and bar chart**

Create `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`:

```tsx
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { getLiveStats } from '../register/api';
import type { ShiftSummary } from '../register/api';

export interface OrderStatsPanelHandle {
  refresh: () => void;
}

function formatCurrency(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  return diffMin < 1 ? 'Ahora' : `Hace ${diffMin} min`;
}

const OrderStatsPanel = forwardRef<OrderStatsPanelHandle>(function OrderStatsPanel(_, ref) {
  const [stats, setStats] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getLiveStats();
    setLoading(false);
    if (!result.ok) {
      setError('No se pudo actualizar');
      return;
    }
    setStats(result.data.summary);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useImperativeHandle(ref, () => ({ refresh: fetchStats }), [fetchStats]);

  const maxQty = stats?.topProducts[0]?.quantity ?? 1;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Estadísticas en vivo
        </span>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
              {formatLastUpdated(lastUpdated)}
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            type="button"
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className={loading ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        {/* KPI tiles — 2×2 grid, rows stretch to match bar chart height */}
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {loading ? (
            <>
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
            </>
          ) : (
            <>
              <div className="bg-emerald-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-emerald-600 leading-none">
                  {formatCurrency(stats?.revenue.completed ?? 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Ingresos</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-amber-600 leading-none">
                  {formatCurrency(stats?.revenue.pending ?? 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Pendiente cobro</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-blue-600 leading-none">
                  {stats?.counts.total ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Total pedidos</p>
              </div>
              <div className="bg-sky-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-sky-600 leading-none">
                  {formatCurrency(stats?.revenue.averageTicket ?? 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Ticket promedio</p>
              </div>
            </>
          )}
        </div>

        {/* Top products — horizontal bar chart */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
            Top productos
          </p>
          {loading ? (
            <div className="flex-1 flex flex-col gap-3 justify-evenly">
              {[80, 65, 50, 40, 30].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2.5 bg-slate-200 rounded animate-pulse" style={{ width: `${w}%` }} />
                  <div className="h-2 bg-slate-100 rounded animate-pulse w-full" />
                </div>
              ))}
            </div>
          ) : stats?.topProducts.length ? (
            <div className="flex-1 flex flex-col gap-3 justify-evenly">
              {stats.topProducts.slice(0, 5).map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between text-xs text-slate-700 mb-1">
                    <span className="truncate pr-2">{p.name}</span>
                    <span className="font-semibold text-slate-800 shrink-0">{p.quantity} uds.</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                      style={{ width: `${Math.round((p.quantity / maxQty) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 flex-1 flex items-center justify-center">
              Sin datos aún
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default OrderStatsPanel;
```

- [ ] **Step 4: Run tests — all 3 should pass**

```bash
docker compose exec res-ui pnpm test -- OrderStatsPanel --reporter=verbose
```

Expected:
```
✓ shows loading skeleton while fetching
✓ renders KPI tiles after successful fetch
✓ renders top products bar chart after fetch
```

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderStatsPanel.tsx \
        apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx
git commit -m "feat(orders): add OrderStatsPanel with KPI tiles and top products bar chart"
```

---

## Task 2: Add refresh button behavior + error handling

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx`
- (No changes to `OrderStatsPanel.tsx` — behavior is already implemented; tests verify it)

- [ ] **Step 1: Add tests for refresh and error handling**

Append to `OrderStatsPanel.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react';

test('refresh button triggers a new fetch', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('$1,240.00')).toBeInTheDocument());

  expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));

  await waitFor(() =>
    expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(2),
  );
});

test('on fetch failure, shows error without clearing existing data', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('$1,240.00')).toBeInTheDocument());

  vi.mocked(registerApi.getLiveStats).mockResolvedValueOnce({
    ok: false,
    error: {},
    httpStatus: 500,
  });
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));

  await waitFor(() =>
    expect(screen.getByText('No se pudo actualizar')).toBeInTheDocument(),
  );
  // Previous data still visible
  expect(screen.getByText('$1,240.00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests**

```bash
docker compose exec res-ui pnpm test -- OrderStatsPanel --reporter=verbose
```

Expected: 5 tests pass. If either fails, the implementation in Task 1 has a bug — fix it now before continuing.

- [ ] **Step 3: Add test for ref handle**

Append to `OrderStatsPanel.test.tsx`:

```tsx
test('ref.refresh() triggers a new getLiveStats call', async () => {
  const ref = createRef<OrderStatsPanelHandle>();
  render(<OrderStatsPanel ref={ref} />);
  await waitFor(() => expect(screen.getByText('$1,240.00')).toBeInTheDocument());

  expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(1);
  ref.current!.refresh();

  await waitFor(() =>
    expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(2),
  );
});
```

- [ ] **Step 4: Run tests — 6 total should pass**

```bash
docker compose exec res-ui pnpm test -- OrderStatsPanel --reporter=verbose
```

Expected: all 6 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx
git commit -m "test(orders): cover refresh button, error handling, and ref handle in OrderStatsPanel"
```

---

## Task 3: Wire `OrderStatsPanel` into `OrdersPanel`

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

- [ ] **Step 1: Add imports and ref at the top of `OrdersPanel.tsx`**

In `apps/ui/src/components/dash/orders/OrdersPanel.tsx`, add `useRef` to the React import and add the new imports after the existing imports:

```tsx
// Change this line:
import { useState, useEffect, useRef, useCallback } from 'react';

// Add after the existing local imports:
import OrderStatsPanel, { type OrderStatsPanelHandle } from './OrderStatsPanel';
```

- [ ] **Step 2: Add `statsPanelRef` inside the component**

Inside `OrdersPanel`, after the existing `inFlightRef` declaration (around line 48), add:

```tsx
const statsPanelRef = useRef<OrderStatsPanelHandle>(null);
```

- [ ] **Step 3: Wire the ref into the SSE reload callback**

Find the SSE `reload` callback (inside the second `useEffect`, around line 121):

```tsx
// Before:
const reload = () => {
  if (!activeFilterRef.current) fetchOrders(null);
};

// After:
const reload = () => {
  if (!activeFilterRef.current) fetchOrders(null);
  statsPanelRef.current?.refresh();
};
```

- [ ] **Step 4: Render `<OrderStatsPanel>` above the kanban in the open-session return**

Find the `return (` at the bottom of `OrdersPanel` (the one inside the `ORDERS_STATUS.OPEN` branch, around line 256). Add `<OrderStatsPanel ref={statsPanelRef} />` between the session info bar and the active-filter/kanban section:

```tsx
return (
  <div className="space-y-4">
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

    <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {/* existing session bar content — unchanged */}
    </div>

    {/* ↓ NEW: stats panel always visible above kanban */}
    <OrderStatsPanel ref={statsPanelRef} />

    {activeFilter ? (
      <OrdersFilteredList ... />
    ) : (
      <OrdersKanban ... />
    )}

    {/* rest of modals unchanged */}
  </div>
);
```

Replace only the section between the session bar `</div>` and the `{activeFilter ? ...}` line. Do **not** touch the modals or toast below.

- [ ] **Step 5: Run the full `OrdersPanel` test suite**

```bash
docker compose exec res-ui pnpm test -- OrdersPanel --reporter=verbose
```

Expected: all existing `OrdersPanel` tests still pass. The stats panel is mocked implicitly because `getLiveStats` is not called by `OrdersPanel` directly — `OrderStatsPanel` calls it internally and `OrderStatsPanel` is not mocked in `OrdersPanel.test.tsx`, so it will render with its own `getLiveStats` call. Add a mock for it at the top of `OrdersPanel.test.tsx` if tests fail due to missing mock:

```tsx
// Add to the existing vi.mock block in OrdersPanel.test.tsx if needed:
vi.mock('../register/api', () => ({
  getLiveStats: vi.fn().mockResolvedValue({ ok: true, data: { summary: {
    counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
    revenue: { completed: 0, pending: 0, averageTicket: 0 },
    byPaymentMethod: [], byOrderType: [], byOrderSource: [], topProducts: [],
  }}}),
}));
```

- [ ] **Step 6: Run all orders tests together**

```bash
docker compose exec res-ui pnpm test -- orders --reporter=verbose
```

Expected: all tests in the `orders/` folder pass.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx \
        apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "feat(orders): wire OrderStatsPanel above kanban, refresh on SSE order events"
```

---

## Self-Review

**Spec coverage:**
- ✅ `OrderStatsPanel` component created with `forwardRef`
- ✅ Renders above kanban, only when session is open
- ✅ Fetches `getLiveStats` on mount
- ✅ KPI tiles: revenue, pending, total orders, avg ticket
- ✅ Top products bar chart (CSS, max 5, gradient fill)
- ✅ Loading skeleton for both tiles and bar chart
- ✅ Manual refresh button (disabled + spinner while loading)
- ✅ Error shown inline without clearing previous data
- ✅ SSE coordination via `ref.refresh()` — single SSE connection
- ✅ No new npm packages

**Type consistency:**
- `OrderStatsPanelHandle.refresh` defined in Task 1, used in Task 2 (`createRef<OrderStatsPanelHandle>`) and Task 3 (`useRef<OrderStatsPanelHandle>`) — consistent.
- `getLiveStats` imported from `../register/api` — same path in component and test mock.

**Placeholder scan:** No TBDs. Step 4 of Task 3 shows partial JSX to indicate placement — the instruction is explicit about what to add and what to leave unchanged.
