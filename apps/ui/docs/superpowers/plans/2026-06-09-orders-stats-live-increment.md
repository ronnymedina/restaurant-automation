# Stats del panel de órdenes en vivo por incremento local (R2-05) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `GET /v1/cash-register/stats` se llame solo en el botón "Actualizar" (+ montaje + reconexión), y que las stats del turno se actualicen en vivo por incremento local a partir de los eventos SSE, sin pegarle al endpoint pesado.

**Architecture:** Se sube el estado `summary` al `OrdersPanel` (manager), que ya recibe los eventos SSE y es dueño de `orders[]`. `OrderStatsPanel` pasa a presentacional puro (props). Los deltas se calculan con una función pura `applyOrderEvent` cuyos predicados replican exactamente `cash-register-stats.service.ts` del backend. El botón hace el único refetch autoritativo que reconcilia drift. **Solo `apps/ui`** — `order:updated` no necesita `totalAmount` porque la orden ya está en la lista local con su monto.

**Tech Stack:** Astro + React 19, TypeScript, Vitest 4 + Testing Library, RxJS SSE (EventSource).

**Spec:** `apps/ui/docs/superpowers/specs/2026-06-09-orders-stats-live-increment-design.md`

**Comando de tests (dentro del contenedor):**
```bash
docker compose exec -T res-ui node_modules/.bin/vitest run <ruta-del-test>
```
> `res-ui` no tiene `pnpm` en `exec -T`; se usa el binario directo. Hay ~13 fallas UI preexistentes en la suite completa — por eso cada paso corre **un archivo puntual**.

---

## File Structure

- **Create** `apps/ui/src/components/dash/orders/stats-delta.ts` — funciones puras `fromSummary`, `applyOrderEvent` + tipos `LiveSummary`, `OrderLike`. Única responsabilidad: la matemática de incremento de stats.
- **Create** `apps/ui/src/components/dash/orders/stats-delta.test.ts` — unit del núcleo de deltas.
- **Modify** `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx` — de stateful+`forwardRef` a presentacional por props.
- **Rewrite** `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx` — tests de render por props (sin fetch ni ref).
- **Modify** `apps/ui/src/components/dash/orders/OrdersPanel.tsx` — manager: dueño de `summary`, `fetchStats`, deltas en handlers SSE, props al hijo.
- **Modify** `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` — regresión: burst SSE = 0 refetch; botón = 1.

---

## Task 1: Núcleo de deltas (`stats-delta.ts`)

**Files:**
- Create: `apps/ui/src/components/dash/orders/stats-delta.ts`
- Test: `apps/ui/src/components/dash/orders/stats-delta.test.ts`

- [x] **Step 1: Write the failing test**

Create `apps/ui/src/components/dash/orders/stats-delta.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { applyOrderEvent, fromSummary, type LiveSummary } from './stats-delta';
import type { ShiftSummary } from '../register/api';

function baseline(over: Partial<LiveSummary> = {}): LiveSummary {
  return {
    counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
    revenue: { collected: 0, pending: 0, averageTicket: 0 },
    byPaymentMethod: [], byOrderType: [], byOrderSource: [], topProducts: [],
    paidCount: 0,
    ...over,
  };
}

describe('applyOrderEvent', () => {
  test('order:new (CREATED, unpaid) suma total/created/pending y revenue.pending', () => {
    const s = applyOrderEvent(baseline(), null, { status: 'CREATED', isPaid: false, totalAmount: 100 });
    expect(s.counts.total).toBe(1);
    expect(s.counts.created).toBe(1);
    expect(s.counts.pending).toBe(1);
    expect(s.revenue.pending).toBe(100);
    expect(s.revenue.collected).toBe(0);
  });

  test('cobro SERVED false→true mueve pending→collected, no toca counts', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'SERVED', isPaid: false, totalAmount: 100 });
    s = applyOrderEvent(s, { status: 'SERVED', isPaid: false, totalAmount: 100 }, { status: 'SERVED', isPaid: true, totalAmount: 100 });
    expect(s.revenue.collected).toBe(100);
    expect(s.revenue.pending).toBe(0);
    expect(s.paidCount).toBe(1);
    expect(s.revenue.averageTicket).toBe(100);
    expect(s.counts.served).toBe(1);
    expect(s.counts.pending).toBe(1);
    expect(s.counts.total).toBe(1);
  });

  test('cancelación SERVED unpaid → CANCELLED quita pending revenue y mueve counts', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'SERVED', isPaid: false, totalAmount: 100 });
    s = applyOrderEvent(s, { status: 'SERVED', isPaid: false, totalAmount: 100 }, { status: 'CANCELLED', isPaid: false, totalAmount: 100 });
    expect(s.revenue.pending).toBe(0);
    expect(s.counts.served).toBe(0);
    expect(s.counts.pending).toBe(0);
    expect(s.counts.cancelled).toBe(1);
    expect(s.counts.total).toBe(1);
  });

  test('completar SERVED paid → COMPLETED mueve counts, revenue intacto', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'SERVED', isPaid: true, totalAmount: 100 });
    s = applyOrderEvent(s, { status: 'SERVED', isPaid: true, totalAmount: 100 }, { status: 'COMPLETED', isPaid: true, totalAmount: 100 });
    expect(s.counts.served).toBe(0);
    expect(s.counts.completed).toBe(1);
    expect(s.counts.pending).toBe(0);
    expect(s.revenue.collected).toBe(100);
    expect(s.paidCount).toBe(1);
  });

  test('averageTicket = collected / paidCount con dos órdenes pagadas', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'COMPLETED', isPaid: true, totalAmount: 100 });
    s = applyOrderEvent(s, null, { status: 'COMPLETED', isPaid: true, totalAmount: 50 });
    expect(s.revenue.collected).toBe(150);
    expect(s.paidCount).toBe(2);
    expect(s.revenue.averageTicket).toBe(75);
  });

  test('no muta el summary de entrada (pureza)', () => {
    const input = baseline();
    applyOrderEvent(input, null, { status: 'CREATED', isPaid: false, totalAmount: 100 });
    expect(input.counts.total).toBe(0);
    expect(input.revenue.pending).toBe(0);
  });
});

describe('fromSummary', () => {
  test('deriva paidCount como Σ count de byPaymentMethod', () => {
    const summary: ShiftSummary = {
      counts: { total: 3, pending: 1, created: 0, confirmed: 0, processing: 0, served: 1, completed: 2, cancelled: 0 },
      revenue: { collected: 300, pending: 50, averageTicket: 150 },
      byPaymentMethod: [{ method: 'CASH', count: 1, total: 100 }, { method: 'CARD', count: 1, total: 200 }],
      byOrderType: [], byOrderSource: [], topProducts: [],
    };
    const live = fromSummary(summary);
    expect(live.paidCount).toBe(2);
    expect(live.revenue.collected).toBe(300);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/stats-delta.test.ts`
Expected: FAIL — `Failed to resolve import "./stats-delta"` / module not found.

- [x] **Step 3: Write the implementation**

Create `apps/ui/src/components/dash/orders/stats-delta.ts`:

```ts
// apps/ui/src/components/dash/orders/stats-delta.ts
//
// Incremento local de las stats del turno a partir de eventos SSE (R2-05).
// Los predicados de `mutate` replican EXACTAMENTE cash-register-stats.service.ts
// del backend (buildCounts + calculateRevenue), de modo que el incremento en vivo
// coincide con el refetch autoritativo del botón (salvo drift de float en pesos,
// reconciliado al refrescar).

import type { ShiftSummary, ShiftCounts } from '../register/api';

export interface LiveSummary extends ShiftSummary {
  // Divisor de averageTicket. No lo expone el endpoint; se deriva al ingerir
  // un summary autoritativo (ver fromSummary) y se mantiene por delta.
  paidCount: number;
}

export type OrderLike = {
  status: string;
  isPaid: boolean;
  totalAmount: number;
};

const STATUS_TO_COUNT_KEY: Record<string, keyof ShiftCounts> = {
  CREATED: 'created',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SERVED: 'served',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * Convierte un summary autoritativo del endpoint en LiveSummary.
 * paidCount = Σ count de byPaymentMethod (misma regla que `collected`:
 * isPaid && status != CANCELLED && paymentMethod presente — buildPaymentMethods backend).
 */
export function fromSummary(summary: ShiftSummary): LiveSummary {
  const paidCount = summary.byPaymentMethod.reduce((sum, m) => sum + m.count, 0);
  return { ...structuredClone(summary), paidCount };
}

/** Aplica (+1) o quita (-1) la contribución de una orden al summary, in place. */
function mutate(summary: LiveSummary, order: OrderLike, sign: 1 | -1): void {
  const status = order.status;

  summary.counts.total += sign;

  const key = STATUS_TO_COUNT_KEY[status];
  if (key) summary.counts[key] += sign;

  // pending (count) = total - completed - cancelled
  if (status !== 'COMPLETED' && status !== 'CANCELLED') {
    summary.counts.pending += sign;
  }

  const counted = status !== 'CANCELLED';
  if (counted && order.isPaid) {
    summary.revenue.collected += sign * order.totalAmount;
    summary.paidCount += sign;
  } else if (counted && !order.isPaid) {
    summary.revenue.pending += sign * order.totalAmount;
  }
}

/**
 * Núcleo del incremento: resta la contribución de la orden vieja y suma la nueva.
 * - order:new      → applyOrderEvent(summary, null, payload)
 * - order:updated  → applyOrderEvent(summary, oldOrder, { ...oldOrder, ...payload })
 * No muta el summary de entrada.
 */
export function applyOrderEvent(
  summary: LiveSummary,
  oldOrder: OrderLike | null,
  newOrder: OrderLike | null,
): LiveSummary {
  const next = structuredClone(summary);
  if (oldOrder) mutate(next, oldOrder, -1);
  if (newOrder) mutate(next, newOrder, 1);
  next.revenue.averageTicket =
    next.paidCount > 0 ? next.revenue.collected / next.paidCount : 0;
  return next;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/stats-delta.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/stats-delta.ts apps/ui/src/components/dash/orders/stats-delta.test.ts
git commit -m "feat(ui): pure stats-delta core for live order stats (R2-05)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `OrderStatsPanel` presentacional

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`
- Rewrite: `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx`

- [x] **Step 1: Rewrite the test to drive a props-based component**

Replace the **entire** contents of `apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, afterEach, test, expect } from 'vitest';
import OrderStatsPanel from './OrderStatsPanel';
import type { ShiftSummary } from '../register/api';

// useRestaurantSettings necesita QueryClientProvider; lo mockeamos (defaults CL).
vi.mock('../../../lib/restaurant-settings', () => ({
  useRestaurantSettings: () => ({ data: { decimalSeparator: ',', thousandsSeparator: '.' } }),
}));

const summary: ShiftSummary = {
  counts: { total: 23, pending: 5, created: 2, confirmed: 1, processing: 1, served: 1, completed: 18, cancelled: 2 },
  revenue: { collected: 1240.0, pending: 180.0, averageTicket: 53.91 },
  byPaymentMethod: [],
  byOrderType: [],
  byOrderSource: [],
  topProducts: [
    { id: '1', name: 'Hamburguesa clásica', quantity: 8, total: 280 },
    { id: '2', name: 'Pizza pepperoni', quantity: 6, total: 210 },
  ],
};

const noop = () => {};

afterEach(() => vi.clearAllMocks());

test('renders KPI tiles from the summary prop', () => {
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={new Date()} error={null} onRefresh={noop} />);
  expect(screen.getByText('$1.240,00')).toBeInTheDocument();
  expect(screen.getByText('$180,00')).toBeInTheDocument();
  expect(screen.getByText('23')).toBeInTheDocument();
  expect(screen.getByText('$53,91')).toBeInTheDocument();
});

test('renders top products from the summary prop', () => {
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={null} error={null} onRefresh={noop} />);
  expect(screen.getByText('Hamburguesa clásica')).toBeInTheDocument();
  expect(screen.getByText('8 uds.')).toBeInTheDocument();
});

test('loading shows skeleton and disables the button', () => {
  render(<OrderStatsPanel summary={null} loading={true} lastUpdated={null} error={null} onRefresh={noop} />);
  expect(screen.queryByText('$1.240,00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
});

test('error prop renders the error message', () => {
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={null} error={'No se pudo actualizar'} onRefresh={noop} />);
  expect(screen.getByText('No se pudo actualizar')).toBeInTheDocument();
});

test('clicking the button calls onRefresh', () => {
  const onRefresh = vi.fn();
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={null} error={null} onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/OrderStatsPanel.test.tsx`
Expected: FAIL — el componente actual ignora las props (`summary`, `onRefresh`) y hace su propio fetch; `onRefresh` no se llama, los KPI no aparecen sin mock de `getLiveStats`.

- [x] **Step 3: Refactor the component to presentational**

Replace the **entire** contents of `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`:

```tsx
import { useRestaurantSettings } from '../../../lib/restaurant-settings';
import { formatMoney } from '../../../lib/money';
import type { ShiftSummary } from '../register/api';

interface OrderStatsPanelProps {
  summary: ShiftSummary | null;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  onRefresh: () => void;
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  return diffMin < 1 ? 'Ahora' : `Hace ${diffMin} min`;
}

export default function OrderStatsPanel({
  summary,
  loading,
  lastUpdated,
  error,
  onRefresh,
}: OrderStatsPanelProps) {
  const { data: settings } = useRestaurantSettings();
  const formatCurrency = (v: number) => formatMoney(v, settings);
  const stats = summary;
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
            aria-label="Actualizar"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className={loading ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        {/* KPI tiles — 2×2 grid */}
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
                  {formatCurrency(stats?.revenue.collected ?? 0)}
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
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/OrderStatsPanel.test.tsx`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderStatsPanel.tsx apps/ui/src/components/dash/orders/OrderStatsPanel.test.tsx
git commit -m "refactor(ui): make OrderStatsPanel presentational (props) (R2-05)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `OrdersPanel` como manager de stats

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

> Nota: la app no compila con el panel a medio cablear (TypeScript del refactor del Task 2 cambió la firma de `OrderStatsPanel`). Por eso este task hace primero el wiring (Steps 1-7) y luego agrega el test de regresión (Steps 8-11).

- [x] **Step 1: Update imports**

En `apps/ui/src/components/dash/orders/OrdersPanel.tsx`, línea 1, agregar `useCallback`:

```ts
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
```

Reemplazar el import de `OrderStatsPanel` (línea ~20) — quitar el handle:

```ts
import OrderStatsPanel from './OrderStatsPanel';
```

Agregar dos imports nuevos debajo de los imports de `./api`:

```ts
import { getLiveStats } from '../register/api';
import { applyOrderEvent, fromSummary, type LiveSummary } from './stats-delta';
```

- [x] **Step 2: Swap the imperative ref for stats state**

Reemplazar la línea `const statsPanelRef = useRef<OrderStatsPanelHandle>(null);` (junto a `inFlightRef`) por el estado de stats + un ref espejo de `orders`:

```ts
  // H-18: Track in-flight order mutations to prevent double-submit.
  const inFlightRef = useRef<Set<string>>(new Set());

  // R2-05: stats del turno como estado del manager (antes vivían en OrderStatsPanel).
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsLastUpdated, setStatsLastUpdated] = useState<Date | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // ordersRef espeja `orders` para que los handlers SSE (closure con deps
  // [status, session]) lean la lista actual sin recrear la conexión.
  const ordersRef = useRef<Order[]>([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
```

- [x] **Step 3: Add `fetchStats` (the only call to the heavy endpoint)**

Agregar la función `fetchStats` justo antes de `async function fetchOrders(...)`:

```ts
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const result = await getLiveStats();
      if (!result.ok) { setStatsError('No se pudo actualizar'); return; }
      setSummary(fromSummary(result.data.summary));
      setStatsLastUpdated(new Date());
    } catch {
      setStatsError('No se pudo actualizar');
    } finally {
      setStatsLoading(false);
    }
  }, []);
```

- [x] **Step 4: Fetch stats once when the session opens**

En `loadSession`, después de `await fetchOrders(null);` (en la rama de sesión abierta), agregar:

```ts
      setSession(result.data);
      setStatus(ORDERS_STATUS.OPEN);
      await fetchOrders(null);
      void fetchStats();
```

- [x] **Step 5: Apply the delta on `order:new` (always, before the filter guard)**

Reemplazar `handleNew` por:

```ts
    const handleNew = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as OrderCreatedPayload;
        if (!payload?.id) return;
        // Stats en vivo: se aplican SIEMPRE (son globales del turno, no dependen
        // del filtro). order:new se entrega una sola vez (Subject sin replay),
        // así que no hace falta dedup para el delta.
        setSummary((prev) => (prev ? applyOrderEvent(prev, null, payload) : prev));
        // Lista: solo sin filtro activo.
        if (activeFilterRef.current) return;
        setOrders((prev) =>
          prev.some((o) => o.id === payload.id) ? prev : [payload as Order, ...prev],
        );
      } catch { /* ignore malformed payload */ }
    };
```

- [x] **Step 6: Apply the delta on `order:updated` (needs the previous order)**

Reemplazar `handleUpdated` por:

```ts
    const handleUpdated = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as OrderUpdatedPayload;
        if (!payload?.id) return;
        // Delta de stats: restamos la contribución de la orden vieja y sumamos la
        // nueva. Necesitamos la orden previa de la lista local; si no está
        // (filtro, tope 100), se omite el delta (reconciliado por el botón).
        const old = ordersRef.current.find((o) => o.id === payload.id);
        if (old) {
          const newOrder = { ...old, ...payload };
          setSummary((s) => (s ? applyOrderEvent(s, old, newOrder) : s));
        }
        setOrders((prev) => prev.map((o) => (o.id === payload.id ? { ...o, ...payload } : o)));
      } catch { /* ignore malformed payload */ }
    };
```

- [x] **Step 7: Refetch stats on SSE reconnect + render the panel by props**

En `handleOpen` (reconexión), agregar el refetch de stats junto al de la lista:

```ts
    const handleOpen = () => {
      if (hasConnectedBefore && !activeFilterRef.current) {
        fetchOrders(null);
        void fetchStats();
      }
      hasConnectedBefore = true;
    };
```

Reemplazar el render `<OrderStatsPanel ref={statsPanelRef} />` por:

```tsx
      <OrderStatsPanel
        summary={summary}
        loading={statsLoading}
        lastUpdated={statsLastUpdated}
        error={statsError}
        onRefresh={fetchStats}
      />
```

- [x] **Step 8: Verify existing tests + typecheck still pass**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/OrdersPanel.test.tsx`
Expected: PASS (los tests actuales del panel siguen verdes con el nuevo wiring).

Run: `docker compose exec -T res-ui node_modules/.bin/astro check 2>&1 | tail -5`
Expected: sin errores nuevos de tipos en `OrdersPanel.tsx` / `OrderStatsPanel.tsx` (referencias a `OrderStatsPanelHandle`/`statsPanelRef` eliminadas).

- [x] **Step 9: Write the regression test (burst SSE = 0 refetch; button = 1)**

En `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`, agregar al import de mocks de `'../register/api'` el handle de `getLiveStats` para assertions. Justo debajo de la línea `const mockGetOrders = vi.mocked(getOrders);`, agregar:

```ts
import { getLiveStats } from '../register/api';
const mockGetLiveStats = vi.mocked(getLiveStats);
```

Agregar este test al final del archivo:

```ts
test('SSE burst does not refetch stats; the button refetches exactly once', async () => {
  // EventSource que captura los listeners para poder disparar eventos a mano.
  const listeners: Record<string, (e: MessageEvent) => void> = {};
  class CapturingEventSource {
    constructor(_url: string, _init?: EventSourceInit) {}
    addEventListener(type: string, cb: (e: MessageEvent) => void) { listeners[type] = cb; }
    close() {}
  }
  vi.stubGlobal('EventSource', CapturingEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 's1', status: 'OPEN', displayOpenedAt: 'now', displayClosedAt: null, closedBy: null, openedByEmail: 'a@b.com' },
  } as any);
  mockGetOrders.mockResolvedValue({ ok: true, data: [] } as any);

  render(<OrdersPanel />);

  // Fetch inicial de stats al abrir sesión.
  await waitFor(() => expect(mockGetLiveStats).toHaveBeenCalledTimes(1));

  // Ráfaga de eventos SSE: NO debe disparar más fetches del endpoint pesado.
  act(() => {
    listeners['order:new']?.(new MessageEvent('m', { data: JSON.stringify({ id: 'n1', status: 'CREATED', isPaid: false, totalAmount: 10 }) }));
    listeners['order:new']?.(new MessageEvent('m', { data: JSON.stringify({ id: 'n2', status: 'CREATED', isPaid: false, totalAmount: 20 }) }));
    listeners['order:updated']?.(new MessageEvent('m', { data: JSON.stringify({ id: 'n1', status: 'CONFIRMED', isPaid: false }) }));
  });
  expect(mockGetLiveStats).toHaveBeenCalledTimes(1);

  // El botón "Actualizar" sí dispara exactamente un refetch.
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
  await waitFor(() => expect(mockGetLiveStats).toHaveBeenCalledTimes(2));
});
```

- [x] **Step 10: Run the regression test**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/OrdersPanel.test.tsx`
Expected: PASS — incluyendo el nuevo test (1 fetch al abrir, 0 en la ráfaga, 2 tras el click).

- [x] **Step 11: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "feat(ui): live-increment order stats via local deltas (R2-05)

order:new/order:updated patch the shift summary locally; the heavy
GET /v1/cash-register/stats now fires only on the refresh button,
session open, and SSE reconnect. OrdersPanel owns the summary; the
imperative stats ref is gone.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Cierre — verificación y doc del hallazgo

**Files:**
- Modify: `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`

- [x] **Step 1: Run the three affected test files together**

Run:
```bash
docker compose exec -T res-ui node_modules/.bin/vitest run \
  src/components/dash/orders/stats-delta.test.ts \
  src/components/dash/orders/OrderStatsPanel.test.tsx \
  src/components/dash/orders/OrdersPanel.test.tsx
```
Expected: PASS en los tres (sin regresiones).

- [x] **Step 2: Mark R2-05 resolved in the audit findings**

En `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`:

1. En el **Estado** (línea ~8) agregar: `R2-05 (MEDIO) RESUELTO el 2026-06-09.`
2. En el **Resumen ejecutivo**, mover R2-05 a resueltos: la fila 🟡 MEDIO pasa a `~~R2-02~~ ✅, ~~R2-03~~ ✅, ~~R2-04~~ ✅, ~~R2-05~~ ✅ RESUELTOS` y actualizar el conteo total a `(5 resueltos, 7 pendientes)`.
3. Sobre el encabezado de la sección `### R2-05 …` agregar el banner de resolución (mismo estilo que R2-04):

```markdown
> ✅ **RESUELTO (2026-06-09).** El endpoint pesado `GET /v1/cash-register/stats` ya no se refetchea por evento SSE: ahora solo corre en el botón "Actualizar", al abrir la sesión y en la reconexión SSE. Las stats del turno se actualizan en vivo por incremento local (`stats-delta.ts`, predicados idénticos a `cash-register-stats.service.ts`); `OrdersPanel` es dueño del `summary` y `OrderStatsPanel` quedó presentacional. Solo UI: `order:updated` no necesitó `totalAmount` porque la orden ya está en la lista local. Ver `apps/ui/docs/superpowers/specs/2026-06-09-orders-stats-live-increment-design.md` y su plan. La descripción de abajo se conserva como registro del hallazgo original.
```

- [x] **Step 3: Commit**

```bash
git add apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md
git commit -m "docs: mark R2-05 resolved in audit findings (R2-05)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Branch**: estás en `develop`. Antes de empezar, verificá con `git branch --show-current` y, si vas a abrir PR, creá una rama de feature (los PRs van contra `develop`).
- **structuredClone**: disponible en el runtime de Vitest 4 (Node ≥17) y en jsdom; no requiere polyfill.
- **`astro check`**: si el contenedor no tiene el binario, correr `docker compose exec -T res-ui node_modules/.bin/tsc --noEmit -p tsconfig.json` como alternativa de typecheck.
