# Orders: Optimistic Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el patrón `fetchOrders` post-mutación con `useOptimistic` para que los cambios de estado de órdenes (confirmar, avanzar, cobrar, desmarcar pago, cancelar) se reflejen en la UI inmediatamente.

**Architecture:** `useOptimistic` vive en `OrdersPanel` junto al `useState<Order[]>` existente. Un nuevo helper `withOptimisticAction` aplica el patch optimista y dispara el API call dentro de `startTransition`. En éxito, el estado real se actualiza desde la respuesta del API; en fallo, `useOptimistic` revierte automáticamente. SSE sigue parcheando el estado real. `fetchOrders` se elimina de todos los mutation handlers; se mantiene solo en carga inicial, cambios de filtro, y reconexión SSE. El guard de SSE `if (activeFilterRef.current) return` se elimina de `handleUpdated` (pero se mantiene en `handleNew`).

**Tech Stack:** React 19 (`useOptimistic`, `useTransition`, `startTransition`), Vitest + React Testing Library

---

## File Map

- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx` — agregar `useOptimistic` + `withOptimisticAction`, eliminar `fetchOrders` post-mutación, eliminar guard de filtro en SSE `handleUpdated`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` — agregar tests de comportamiento optimista, eliminar tests H-18 de disabled-button
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx` — eliminar prop `inFlightIds` y lógica `isBusy`
- Modify: `apps/ui/src/components/dash/orders/OrdersKanban.tsx` — eliminar prop `inFlightIds`
- Modify: `apps/ui/src/components/dash/orders/OrdersFilteredList.tsx` — eliminar prop `inFlightIds`

---

### Task 1: Write failing tests and remove stale H-18 disabled-button tests

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

- [ ] **Step 1: Delete the two H-18 regression disabled-button tests**

Remove lines 182–235 (the two tests named `'H-18 (regression): Confirmar button is disabled while mutation is in-flight (Kanban path)'` and `'H-18 (regression): Confirmar button is disabled while mutation is in-flight (FilteredList path)'`).

Keep the `'H-18: rapid double-click on Confirmar dispatches confirmOrder once'` test at line 157 — it still validates the double-submit guard.

- [ ] **Step 2: Add 4 new tests after the surviving H-18 double-click test**

Insert after line 180 (after the closing `});` of the surviving H-18 test):

```tsx
test('applies optimistic CONFIRMED status immediately on Confirmar click', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockImplementation(() => new Promise(() => {})); // never resolves

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });
  fireEvent.click(confirmBtn);

  // Optimistic update: card moves to CONFIRMED column, button changes to "Procesar"
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Procesar' })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
});

test('does not call getOrders after a successful confirmOrder', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockResolvedValue({
    ok: true,
    data: {
      id: 'o1', orderNumber: 1, status: 'CONFIRMED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
    } as any,
  });

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(1));
  mockGetOrders.mockClear();

  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });
  fireEvent.click(confirmBtn);

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Procesar' })).toBeInTheDocument(),
  );
  expect(mockGetOrders).not.toHaveBeenCalled();
});

test('reverts optimistic update and shows toast on confirmOrder failure', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockResolvedValue({
    ok: false, error: { message: 'Error al confirmar' }, httpStatus: 422,
  });

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });
  fireEvent.click(confirmBtn);

  // After failure, reverts to CREATED state and shows error toast
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByText('Error al confirmar')).toBeInTheDocument(),
  );
});

test('SSE order:updated patches state even when filter is active', async () => {
  let capturedHandlers: Record<string, (e: MessageEvent) => void> = {};
  class SpyEventSource {
    addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      capturedHandlers[event] = handler;
    });
    close = vi.fn();
    constructor(_url: string, _init?: EventSourceInit) {}
  }
  vi.stubGlobal('EventSource', SpyEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-1', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 5, status: 'CREATED', isPaid: false,
      totalAmount: 500, paymentMethod: null, cancellationReason: null,
      customerEmail: null, customerPhone: null, deliveryAddress: null,
      deliveryReferences: null, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '11:00', cashShiftId: 'shift-1', createdAt: '2026-01-01T11:00:00Z',
      items: [],
    }],
  });

  render(<OrdersPanel />);
  await screen.findByText(/#5/);

  // Apply a filter to switch to FilteredList mode
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Creado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  await waitFor(() => expect(screen.getByText(/Filtro activo/)).toBeInTheDocument());

  // Dispatch order:updated while filter is active — should still patch local state
  capturedHandlers['order:updated']?.({
    data: JSON.stringify({
      id: 'o1', status: 'CONFIRMED', isPaid: true,
      paymentMethod: 'CASH', cancellationReason: null,
    }),
  } as MessageEvent);

  // isPaid: true → "Pagado" badge should appear in the filtered list
  await waitFor(() => expect(screen.getByText('Pagado')).toBeInTheDocument());
});
```

- [ ] **Step 3: Run tests to verify the 4 new tests fail**

```bash
docker compose exec res-ui pnpm --filter ui test src/components/dash/orders/OrdersPanel.test.tsx
```

Expected: 4 new tests FAIL (implementation not changed yet), all pre-existing tests still pass.

- [ ] **Step 4: Commit test changes**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "test(orders): add optimistic update tests, remove stale disabled-button tests"
```

---

### Task 2: Implement OrdersPanel.tsx

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

- [ ] **Step 1: Update React imports**

Replace line 1:
```ts
import { useState, useEffect, useRef, useCallback } from 'react';
```
With:
```ts
import { useState, useEffect, useRef, useOptimistic, useTransition } from 'react';
```

- [ ] **Step 2: Replace inFlightVersion state + withInFlight with useOptimistic + withOptimisticAction**

Remove these lines (currently around lines 51–63):
```ts
const [inFlightVersion, setInFlightVersion] = useState(0);

const withInFlight = useCallback(async (id: string, fn: () => Promise<void>): Promise<void> => {
  if (inFlightRef.current.has(id)) return; // synchronous guard — prevents double-submit
  inFlightRef.current.add(id);
  setInFlightVersion((v) => v + 1);
  try {
    await fn();
  } finally {
    inFlightRef.current.delete(id);
    setInFlightVersion((v) => v + 1);
  }
}, []);
```

Add in their place (right after `const inFlightRef = useRef<Set<string>>(new Set());`):
```ts
const [optimisticOrders, applyOptimistic] = useOptimistic(
  orders,
  (state, patch: Partial<Order> & { id: string }) =>
    state.map((o) => (o.id === patch.id ? { ...o, ...patch } : o)),
);
const [, startTransition] = useTransition();

function withOptimisticAction(id: string, patch: Partial<Order>, fn: () => Promise<void>) {
  if (inFlightRef.current.has(id)) return;
  inFlightRef.current.add(id);
  startTransition(async () => {
    applyOptimistic({ id, ...patch });
    try { await fn(); }
    finally { inFlightRef.current.delete(id); }
  });
}
```

- [ ] **Step 3: Replace handleAdvance**

Replace the entire `handleAdvance` function:
```ts
function handleAdvance(id: string, nextStatus: string) {
  if (!session) return;
  if (nextStatus === 'COMPLETED') {
    const order = optimisticOrders.find((o) => o.id === id);
    if (!order?.isPaid) {
      showToast('El pedido debe estar pagado antes de completarse', true);
      return;
    }
  }
  withOptimisticAction(id, { status: nextStatus }, async () => {
    const result = await updateOrderStatus(id, nextStatus);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al actualizar', true);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
  });
}
```

- [ ] **Step 4: Replace handleConfirm**

Replace the entire `handleConfirm` function:
```ts
function handleConfirm(id: string) {
  if (!session) return;
  withOptimisticAction(id, { status: 'CONFIRMED' }, async () => {
    const result = await confirmOrder(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al confirmar', true);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
    showToast('Pedido confirmado');
  });
}
```

- [ ] **Step 5: Replace handlePay**

Replace the entire `handlePay` function:
```ts
function handlePay(id: string, paymentMethod: string) {
  if (!session) return;
  withOptimisticAction(id, { isPaid: true, paymentMethod }, async () => {
    const result = await markOrderPaid(id, paymentMethod);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al marcar pagado', true);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
    showToast('Marcado como pagado');
  });
}
```

- [ ] **Step 6: Replace handleUnpay**

Replace the entire `handleUnpay` function:
```ts
function handleUnpay(id: string) {
  if (!session) return;
  withOptimisticAction(id, { isPaid: false, paymentMethod: undefined }, async () => {
    const result = await unmarkOrderPaid(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al desmarcar pago', true);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
    showToast('Pago desmarcado');
  });
}
```

- [ ] **Step 7: Replace handleCancelConfirm**

Replace the entire `handleCancelConfirm` function:
```ts
function handleCancelConfirm(id: string, reason: string) {
  if (!session) return;
  const order = orders.find((o) => o.id === id);
  withOptimisticAction(id, { status: 'CANCELLED', cancellationReason: reason }, async () => {
    const result = await cancelOrder(id, reason);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al cancelar', true);
      return;
    }
    setCancelOrderId(null);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
    if (order?.status === 'PROCESSING') {
      showToast('⚠️ Pedido cancelado. Recuerda notificar a tu cocina.', false);
    } else {
      showToast('Pedido cancelado');
    }
  });
}
```

- [ ] **Step 8: Remove the SSE guard in handleUpdated**

In the SSE `useEffect`, in `handleUpdated`, remove the line:
```ts
if (activeFilterRef.current) return;
```

The function body should be just:
```ts
const handleUpdated = (e: MessageEvent) => {
  try {
    const payload = JSON.parse(e.data) as OrderUpdatedPayload;
    if (!payload?.id) return;
    setOrders((prev) => prev.map((o) => (o.id === payload.id ? { ...o, ...payload } : o)));
  } catch { /* ignore malformed payload */ }
};
```

- [ ] **Step 9: Replace cardCallbacks block and pass optimisticOrders to children**

Remove the `void inFlightVersion;` line and replace the entire `cardCallbacks` block:
```ts
const cardCallbacks = {
  onConfirm: handleConfirm,
  onAdvance: handleAdvance,
  onPay: handlePay,
  onUnpay: handleUnpay,
  onCancel: (id: string) => setCancelOrderId(id),
  onCancelBlocked: handleCancelBlocked,
};
```

In the JSX, replace `orders={orders}` with `orders={optimisticOrders}` in both child components:
```tsx
{activeFilter ? (
  <OrdersFilteredList
    orders={optimisticOrders}
    filterLabel={activeFilter.label}
    {...cardCallbacks}
    onClearFilter={() => handleApplyFilter({ statuses: [] })}
  />
) : (
  <OrdersKanban orders={optimisticOrders} {...cardCallbacks} />
)}
```

- [ ] **Step 10: Run tests**

```bash
docker compose exec res-ui pnpm --filter ui test src/components/dash/orders/OrdersPanel.test.tsx
```

Expected: todos los tests PASAN incluyendo los 4 nuevos de Task 1.

- [ ] **Step 11: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx
git commit -m "feat(orders): add useOptimistic for immediate UI updates, remove post-mutation fetchOrders"
```

---

### Task 3: Simplify OrderCard, OrdersKanban, OrdersFilteredList

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersKanban.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersFilteredList.tsx`

- [ ] **Step 1: Update OrderCardCallbacks interface — remove inFlightIds**

In `OrderCard.tsx`, remove the `inFlightIds` line from the interface (currently line ~57):
```ts
export interface OrderCardCallbacks {
  onConfirm: (id: string) => void;
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string, paymentMethod: string) => void;
  onUnpay: (id: string) => void;
  onCancel: (id: string) => void;
  onCancelBlocked: (id: string) => void;
}
```

- [ ] **Step 2: Remove inFlightIds from OrderCard function signature and remove isBusy**

Replace the destructuring signature:
```ts
export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked,
}: OrderCardProps) {
```

Remove the `isBusy` line:
```ts
const isBusy = inFlightIds.has(order.id);
```

- [ ] **Step 3: Remove isBusy references from the JSX**

Remove `aria-busy={isBusy}` from the outer `<div>`.

Update the `<select>` (cobrar) — remove `disabled={isBusy}` and its `disabled:opacity-50 disabled:cursor-not-allowed` Tailwind classes:
```tsx
<select
  value={order.paymentMethod ?? payMethod}
  onChange={(e) => { setPayMethod(''); onPay(order.id, e.target.value); }}
  className="text-xs rounded px-1.5 py-0.5 cursor-pointer border border-amber-300 bg-amber-50 text-amber-800"
>
```

Update the primary action button — remove `isBusy ||` from the `disabled` condition, keep the SERVED+unpaid check:
```tsx
<button
  type="button"
  disabled={order.status === 'SERVED' && !order.isPaid}
  title={order.status === 'SERVED' && !order.isPaid ? 'Cobra primero' : undefined}
  onClick={() => {
    if (order.status === 'CREATED') onConfirm(order.id);
    else if (order.status === 'CONFIRMED') onAdvance(order.id, 'PROCESSING');
    else if (order.status === 'PROCESSING') onAdvance(order.id, 'SERVED');
    else if (order.status === 'SERVED') onAdvance(order.id, 'COMPLETED');
  }}
  className={`w-full py-2 text-sm font-bold text-white rounded-lg cursor-pointer border-none disabled:opacity-60 disabled:cursor-not-allowed ${PRIMARY_CONFIGS[order.status]?.color ?? ''}`}
>
```

Remove `disabled={isBusy}` and `disabled:opacity-60 disabled:cursor-not-allowed` from the "Desmarcar Pago" button and both "Cancelar" buttons (these had no other disabled condition):
```tsx
<button
  type="button"
  onClick={() => onUnpay(order.id)}
  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-amber-600 hover:bg-slate-50"
>
  ↩ Desmarcar Pago
</button>
```
```tsx
<button
  type="button"
  onClick={() => onCancel(order.id)}
  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-red-600 hover:bg-slate-50"
>
  ✕ Cancelar
</button>
```
```tsx
<button
  type="button"
  onClick={() => onCancelBlocked(order.id)}
  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-red-600 hover:bg-slate-50"
  title="Desmarca el pago antes de cancelar"
>
  ✕ Cancelar
</button>
```

- [ ] **Step 4: Update OrdersKanban.tsx — remove inFlightIds**

Replace the function signature and `cardCallbacks`:
```ts
export default function OrdersKanban({ orders, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked }: OrdersKanbanProps) {
  const byStatus = (status: string) => orders.filter((o) => o.status === status);
  const cardCallbacks = { onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked };
```

- [ ] **Step 5: Update OrdersFilteredList.tsx — remove inFlightIds**

Replace the destructuring:
```ts
export default function OrdersFilteredList({
  orders,
  filterLabel,
  onClearFilter,
  onConfirm,
  onAdvance,
  onPay,
  onUnpay,
  onCancel,
  onCancelBlocked,
}: OrdersFilteredListProps) {
```

In the `OrderCard` render inside the map, remove the `inFlightIds={inFlightIds}` prop:
```tsx
<OrderCard
  key={order.id}
  order={order}
  onConfirm={onConfirm}
  onAdvance={onAdvance}
  onPay={onPay}
  onUnpay={onUnpay}
  onCancel={onCancel}
  onCancelBlocked={onCancelBlocked}
/>
```

- [ ] **Step 6: Run all orders tests**

```bash
docker compose exec res-ui pnpm --filter ui test src/components/dash/orders/
```

Expected: todos los tests PASAN.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx apps/ui/src/components/dash/orders/OrdersKanban.tsx apps/ui/src/components/dash/orders/OrdersFilteredList.tsx
git commit -m "refactor(orders): remove inFlightIds prop — useOptimistic handles visual feedback"
```
