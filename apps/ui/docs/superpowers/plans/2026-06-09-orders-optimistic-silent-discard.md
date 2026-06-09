# R2-04 — Optimistic Silent Discard Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evitar que una segunda acción sobre la misma orden se descarte en silencio: deshabilitar los botones/select de la tarjeta mientras hay una mutación en vuelo (prevención) y mostrar un toast en el early-return (red de seguridad).

**Architecture:** `OrdersPanel` ya mantiene `pendingPatches` como state reactivo con el mismo ciclo de vida que el guard `inFlightRef`. Se deriva `busyIds = new Set(pendingPatches.keys())` y se propaga como `inFlightIds` por `OrdersKanban`/`OrdersFilteredList` hasta `OrderCard`, que calcula su `isBusy` local y deshabilita acciones + expone `aria-busy`. Sin cambios de backend.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, Tailwind. Tests dentro del contenedor (`docker compose exec -T res-ui node_modules/.bin/vitest`), porque `res-ui` no tiene `pnpm` en `exec -T`.

---

### Task 1: Regression test — second action blocked while one is in flight (TDD)

Este es el único ciclo TDD: el test es de integración a nivel `OrdersPanel` y sólo pasa cuando el flag `inFlightIds` está cableado end-to-end (Panel → Kanban → Card). Por eso el test se escribe primero, se verifica que falla, y luego se implementan las cuatro modificaciones antes de volver a correrlo.

**Files:**
- Test: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` (agregar test)
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersKanban.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersFilteredList.tsx`

- [ ] **Step 1: Write the failing test**

Agregar este test al final de `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` (el mock de `updateOrderStatus` ya existe en el `vi.mock('./api', …)` del archivo):

```tsx
test('R2-04: blocks a second action on the same order while one is in flight', async () => {
  const { updateOrderStatus } = await import('./api');
  // Never resolves: the advance mutation stays in flight for the whole test.
  vi.mocked(updateOrderStatus).mockImplementation(() => new Promise(() => {}));

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'PROCESSING', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  const { container } = render(<OrdersPanel />);

  // PROCESSING primary action is labelled "Entregar".
  const advanceBtn = await screen.findByRole('button', { name: 'Entregar' });
  fireEvent.click(advanceBtn);

  // The optimistic patch flips the card to SERVED while the request is in flight.
  // The "Cancelar" button would otherwise stay live and silently discard the second
  // action; with the fix it is disabled and the card exposes aria-busy.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Cancelar/ })).toBeDisabled();
  });
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/OrdersPanel.test.tsx -t "R2-04"
```
Expected: FAIL — el botón "Cancelar" no está `disabled` (hoy no recibe `isBusy`) y no hay ningún elemento con `aria-busy="true"`.

- [ ] **Step 3: Implement — `OrdersPanel.tsx` (toast + busyIds + propagación)**

En `apps/ui/src/components/dash/orders/OrdersPanel.tsx`:

3a. Toast en el early-return de `withOptimisticAction` (`showToast` es una `function` declaration, está hoisted, se puede llamar aunque se defina más abajo):

```ts
  function withOptimisticAction(id: string, patch: Partial<Order>, fn: () => Promise<void>) {
    if (inFlightRef.current.has(id)) {
      showToast('Procesando el pedido, espera un momento…');
      return;
    }
    inFlightRef.current.add(id);
    setPendingPatches((prev) => { const m = new Map(prev); m.set(id, patch); return m; });
    void fn().finally(() => {
      inFlightRef.current.delete(id);
      setPendingPatches((prev) => { const m = new Map(prev); m.delete(id); return m; });
    });
  }
```

3b. Derivar `busyIds` justo después del `useMemo` de `optimisticOrders` (necesita `useMemo`, ya importado en la línea 1):

```ts
  // R2-04: órdenes con una mutación en vuelo. Mismo ciclo de vida que inFlightRef,
  // pero como state reactivo para deshabilitar las acciones de la tarjeta.
  const busyIds = useMemo(() => new Set(pendingPatches.keys()), [pendingPatches]);
```

3c. Agregar `inFlightIds` al objeto `cardCallbacks`:

```ts
  const cardCallbacks = {
    onConfirm: handleConfirm,
    onAdvance: handleAdvance,
    onPay: handlePay,
    onUnpay: handleUnpay,
    onCancel: (id: string) => setCancelOrderId(id),
    onCancelBlocked: handleCancelBlocked,
    inFlightIds: busyIds,
  };
```

- [ ] **Step 4: Implement — `OrderCard.tsx` (isBusy + aria-busy + disabled)**

En `apps/ui/src/components/dash/orders/OrderCard.tsx`:

4a. Agregar `inFlightIds` a la interfaz `OrderCardCallbacks`:

```ts
export interface OrderCardCallbacks {
  onConfirm: (id: string) => void;
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string, paymentMethod: string) => void;
  onUnpay: (id: string) => void;
  onCancel: (id: string) => void;
  onCancelBlocked: (id: string) => void;
  /** IDs de órdenes con una mutación en vuelo; deshabilita acciones para evitar descartes silenciosos (R2-04). */
  inFlightIds?: Set<string>;
}
```

4b. Desestructurar `inFlightIds` y derivar `isBusy` (junto al resto de hooks/derivados, antes del `return`):

```ts
export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, inFlightIds,
}: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';
  const isActive = ACTIVE_STATUSES.has(order.status);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState(order.paymentMethod ?? '');
  const hasCustomerData = order.customerEmail || order.customerPhone || order.deliveryAddress;
  const isBusy = inFlightIds?.has(order.id) ?? false;
  const { data: settings } = useRestaurantSettings();
```

4c. `aria-busy` en el div raíz:

```tsx
    <div
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${border} shadow-sm`}
      aria-busy={isBusy}
    >
```

4d. Select de método (dentro del bloque `isActive && !order.isPaid`): agregar `disabled` y clases:

```tsx
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                disabled={isBusy}
                className="text-xs rounded px-1.5 py-0.5 cursor-pointer border border-amber-300 bg-amber-50 text-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
```

4e. Botón primario, rama **no pagada** (`grid-cols-3`): incluir `isBusy` en `disabled`:

```tsx
                <button
                  type="button"
                  disabled={isBusy || order.status === 'SERVED'}
                  title={order.status === 'SERVED' ? 'Cobra primero' : undefined}
                  onClick={() => {
                    if (order.status === 'CREATED') onConfirm(order.id);
                    else if (order.status === 'CONFIRMED') onAdvance(order.id, 'PROCESSING');
                    else if (order.status === 'PROCESSING') onAdvance(order.id, 'SERVED');
                  }}
                  className={`py-2 text-sm font-bold text-white rounded-lg cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed ${PRIMARY_CONFIGS[order.status]?.color ?? 'bg-slate-400'}`}
                >
                  {PRIMARY_LABELS[order.status] ?? 'Completar'}
                </button>
```

4f. Botón "Pagado": incluir `isBusy` en `disabled`:

```tsx
                <button
                  type="button"
                  disabled={isBusy || !payMethod}
                  onClick={() => onPay(order.id, payMethod)}
                  className="py-2 text-sm font-bold text-white rounded-lg cursor-pointer border-none bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Pagado
                </button>
```

4g. Botón "✕ Cancelar" (rama no pagada): agregar `disabled` y clases:

```tsx
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onCancel(order.id)}
                  className="py-2 text-xs font-semibold border border-slate-200 bg-white rounded-lg cursor-pointer text-red-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✕ Cancelar
                </button>
```

4h. Botón primario, rama **pagada** (`grid-cols-2`): agregar `disabled` y clases:

```tsx
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (order.status === 'CREATED') onConfirm(order.id);
                    else if (order.status === 'CONFIRMED') onAdvance(order.id, 'PROCESSING');
                    else if (order.status === 'PROCESSING') onAdvance(order.id, 'SERVED');
                    else if (order.status === 'SERVED') onAdvance(order.id, 'COMPLETED');
                  }}
                  className={`py-2 text-sm font-bold text-white rounded-lg cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed ${PRIMARY_CONFIGS[order.status]?.color ?? ''}`}
                >
                  {order.status === 'SERVED' ? 'Completar' : PRIMARY_LABELS[order.status]}
                </button>
```

4i. Botón "↩ Desmarcar Pago": agregar `disabled` y clases:

```tsx
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onUnpay(order.id)}
                  className="py-2 text-xs font-semibold border border-slate-200 bg-white rounded-lg cursor-pointer text-amber-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↩ Desmarcar Pago
                </button>
```

- [ ] **Step 5: Implement — `OrdersKanban.tsx` (propagar inFlightIds)**

En `apps/ui/src/components/dash/orders/OrdersKanban.tsx`, agregar `inFlightIds` a la desestructuración y al objeto `cardCallbacks` (`OrdersKanbanProps` ya extiende `OrderCardCallbacks`, así que el tipo entra solo):

```ts
export default function OrdersKanban({ orders, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, inFlightIds }: OrdersKanbanProps) {
  const byStatus = (status: string) => orders.filter((o) => o.status === status);
  const cardCallbacks = { onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, inFlightIds };
```

- [ ] **Step 6: Implement — `OrdersFilteredList.tsx` (propagar inFlightIds)**

En `apps/ui/src/components/dash/orders/OrdersFilteredList.tsx`, agregar `inFlightIds` a la desestructuración y pasarlo explícitamente a `OrderCard`:

```tsx
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
  inFlightIds,
}: OrdersFilteredListProps) {
```

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
              inFlightIds={inFlightIds}
            />
```

- [ ] **Step 7: Run the new test to verify it passes**

Run:
```bash
docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/OrdersPanel.test.tsx -t "R2-04"
```
Expected: PASS.

- [ ] **Step 8: Run the full orders test suite (no regressions)**

Run:
```bash
docker compose exec -T res-ui node_modules/.bin/vitest run src/components/dash/orders/
```
Expected: PASS. En particular `H-18: rapid double-click on Confirmar dispatches confirmOrder once` sigue verde — el segundo clic cae sobre un botón ahora `disabled`, y `fireEvent.click` sobre un botón deshabilitado no dispara el handler, así que `confirmOrder` se sigue llamando una sola vez.

- [ ] **Step 9: Typecheck**

Run:
```bash
docker compose exec -T res-ui node_modules/.bin/astro check
```
Expected: sin nuevos errores de tipo en los cuatro archivos modificados. (Si `astro check` no está disponible o el baseline ya tiene errores ajenos, basta con que no aparezcan errores nuevos referidos a `inFlightIds`/`isBusy`.)

- [ ] **Step 10: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx \
        apps/ui/src/components/dash/orders/OrderCard.tsx \
        apps/ui/src/components/dash/orders/OrdersKanban.tsx \
        apps/ui/src/components/dash/orders/OrdersFilteredList.tsx \
        apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "fix(ui): block silently-discarded concurrent order actions (R2-04)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Mark R2-04 resolved in the audit findings

**Files:**
- Modify: `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`

- [ ] **Step 1: Update the executive summary row**

En la tabla de "Resumen ejecutivo", mover R2-04 a resuelto:

```markdown
| 🟡 MEDIO | 4 | ~~R2-02~~ ✅, ~~R2-03~~ ✅, ~~R2-04~~ ✅ RESUELTOS, R2-05 |
```

Y actualizar el total: `**Total** | **12** (4 resueltos, 8 pendientes)`.

- [ ] **Step 2: Add the resolved banner under the R2-04 heading**

Justo debajo de `### R2-04 — Acciones optimistas concurrentes se descartan en silencio`, insertar:

```markdown
> ✅ **RESUELTO (2026-06-09).** Se restauró la defensa visual: las acciones de la tarjeta se deshabilitan (+`aria-busy`) mientras hay una mutación en vuelo, derivando el estado "busy" de `pendingPatches` (sin re-introducir el prop que quitó `8842af1`). El early-return de `withOptimisticAction` ahora muestra un toast ("Procesando el pedido, espera un momento…") como red de seguridad. Cubierto por un test de regresión en `OrdersPanel.test.tsx`. Ver `apps/ui/docs/superpowers/specs/2026-06-08-orders-optimistic-silent-discard-design.md` y su plan. La descripción de abajo se conserva como registro del hallazgo original.
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md
git commit -m "docs: mark R2-04 resolved in audit findings (R2-04)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** El spec pide (1) señal busy derivada de `pendingPatches` → Step 3b; (2) toast en early-return → Step 3a; (3) `aria-busy` + `disabled` en todos los botones/select de `OrderCard` adaptados al layout actual → Steps 4c–4i; (4) threading por Kanban y FilteredList → Steps 5–6; (5) test de regresión + no-regresión de H-18 → Steps 1, 7, 8. Todo cubierto. Marcar el hallazgo como resuelto → Task 2.
- **Placeholder scan:** Sin TBD/TODO; todos los pasos de código muestran el código completo.
- **Type consistency:** `inFlightIds?: Set<string>` se define en `OrderCardCallbacks` (4a) y se consume con `inFlightIds?.has(order.id)` (4b); `busyIds` es `Set<string>` (3b) y se pasa como `inFlightIds` (3c, 5, 6). Coherente end-to-end.
