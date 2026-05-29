# Orders Kanban UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the OrderCard and OrdersKanban columns with semantic colors, a clear action-zone layout (primary + secondary buttons), and an inline payment method selector for orders missing one.

**Architecture:** Three files change. `OrdersKanban.tsx` gets new palette constants. `OrderCard.tsx` gets new border colors, restructured button zone, and an inline `<select>` for missing payment methods. `OrdersPanel.tsx` threads an optional `paymentMethod` string through `handlePay` → `markOrderPaid` (the API function already accepts it).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Astro (build only), no new dependencies.

---

## File Map

| File | Change |
|---|---|
| `apps/ui/src/components/dash/orders/OrdersKanban.tsx` | Replace COLUMNS color tokens; badge text → `text-white` |
| `apps/ui/src/components/dash/orders/OrderCard.tsx` | Update BORDER_COLORS; add `selectedPaymentMethod` state; update `onPay` signature; add payment selector in total row; restructure action zone |
| `apps/ui/src/components/dash/orders/OrdersPanel.tsx` | Update `handlePay` signature to accept and forward `paymentMethod?` |

---

## Task 1: Update COLUMNS palette in OrdersKanban.tsx

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersKanban.tsx:5-38`

- [ ] **Step 1: Replace COLUMNS constant**

Replace lines 5–38 with:

```typescript
const COLUMNS = [
  {
    status: 'CREATED',
    label: 'Creado',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badgeBg: 'bg-yellow-400',
  },
  {
    status: 'CONFIRMED',
    label: 'Confirmado',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badgeBg: 'bg-blue-500',
  },
  {
    status: 'PROCESSING',
    label: 'En Proceso',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-800',
    badgeBg: 'bg-indigo-500',
  },
  {
    status: 'SERVED',
    label: 'Listo para servir o entregar',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    badgeBg: 'bg-green-600',
  },
];
```

- [ ] **Step 2: Fix badge text color in JSX**

Find the badge `<span>` inside the COLUMNS map (currently line ~56):

```tsx
<span className={`text-xs font-medium ${badgeBg} ${text} px-2 py-0.5 rounded-full`}>
```

Replace with (badge text is always white, not column text color):

```tsx
<span className={`text-xs font-medium ${badgeBg} text-white px-2 py-0.5 rounded-full`}>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/ui && pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersKanban.tsx
git commit -m "feat(ui): update kanban column palette to semáforo lógico"
```

---

## Task 2: Update BORDER_COLORS in OrderCard.tsx

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx:11-18`

- [ ] **Step 1: Replace BORDER_COLORS constant**

Replace the current `BORDER_COLORS` object (lines 11–18):

```typescript
const BORDER_COLORS: Record<string, string> = {
  CREATED: 'border-l-yellow-400',
  CONFIRMED: 'border-l-blue-400',
  PROCESSING: 'border-l-indigo-400',
  SERVED: 'border-l-green-500',
  COMPLETED: 'border-l-green-400',
  CANCELLED: 'border-l-red-400',
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/ui && pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(ui): update OrderCard border accent colors to match column palette"
```

---

## Task 3: Update `onPay` signature and thread `paymentMethod` through OrdersPanel

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx:37`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx:124-133`

- [ ] **Step 1: Update `OrderCardCallbacks.onPay` in OrderCard.tsx**

Find `OrderCardCallbacks` interface (lines 34–41) and change the `onPay` line:

```typescript
// before
onPay: (id: string) => void;

// after
onPay: (id: string, paymentMethod?: string) => void;
```

- [ ] **Step 2: Update `handlePay` in OrdersPanel.tsx**

Replace the `handlePay` function (lines 124–133):

```typescript
async function handlePay(id: string, paymentMethod?: string) {
  if (!session) return;
  const result = await markOrderPaid(id, paymentMethod);
  if (!result.ok) {
    showToast(result.error.message ?? 'Error al marcar pagado', true);
    return;
  }
  showToast('Marcado como pagado');
  await fetchOrders(activeFilter);
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/ui && pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors. TypeScript will now require all callers of `onPay` to match the new signature.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx \
        apps/ui/src/components/dash/orders/OrdersPanel.tsx
git commit -m "feat(ui): thread paymentMethod through onPay → handlePay → markOrderPaid"
```

---

## Task 4: Add `selectedPaymentMethod` state and payment selector in total row

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`

- [ ] **Step 1: Add `selectedPaymentMethod` state**

After the existing `useState` for `customerModalOpen` (line 52), add:

```typescript
const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
```

- [ ] **Step 2: Replace the payment method display in the total row**

Find this block in the total row (lines 74–81):

```tsx
<div className="flex items-center justify-between pt-1 border-t border-slate-100">
  <span className="font-semibold text-sm text-slate-800">
    ${Number(order.totalAmount).toFixed(2)}
  </span>
  <span className="text-xs text-slate-500">
    {PAYMENT_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '-'}
  </span>
</div>
```

Replace with:

```tsx
<div className="flex items-center justify-between pt-1 border-t border-slate-100">
  <span className="font-semibold text-sm text-slate-800">
    ${Number(order.totalAmount).toFixed(2)}
  </span>
  {isActive && !order.paymentMethod ? (
    <div className="flex items-center gap-1">
      <span className="text-amber-600 text-xs">⚠</span>
      <select
        value={selectedPaymentMethod}
        onChange={(e) => setSelectedPaymentMethod(e.target.value)}
        className="border border-amber-300 bg-amber-50 text-amber-800 text-xs rounded px-1.5 py-0.5 cursor-pointer"
      >
        <option value="" disabled>— Asignar método —</option>
        <option value="CASH">Efectivo</option>
        <option value="CARD">Tarjeta</option>
        <option value="DIGITAL_WALLET">Digital</option>
      </select>
    </div>
  ) : (
    <span className="text-xs text-slate-500">
      {PAYMENT_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '-'}
    </span>
  )}
</div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/ui && pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(ui): add inline payment method selector for orders with missing method"
```

---

## Task 5: Restructure action zone — primary button + secondary buttons

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx:111-185`

This is the main restructuring. The old buttons block (flex wrap with all buttons mixed) is replaced with:
1. A `border-t` divider
2. A full-width primary button (solid, `font-bold`)
3. A flex row of secondary outline buttons

**Button state matrix:**

| State | isPaid | Primary label | Primary color | Secondary buttons |
|---|---|---|---|---|
| CREATED | false | Confirmar | `bg-amber-500 hover:bg-amber-600` | [Marcar Pagado] [Cancelar] |
| CREATED | true | Confirmar | `bg-amber-500 hover:bg-amber-600` | [Desmarcar Pago] [Cancelar*] |
| CONFIRMED | false | Procesar | `bg-blue-600 hover:bg-blue-700` | [Marcar Pagado] [Cancelar] |
| CONFIRMED | true | Procesar | `bg-blue-600 hover:bg-blue-700` | [Desmarcar Pago] [Cancelar*] |
| PROCESSING | false | Entregar | `bg-indigo-600 hover:bg-indigo-700` | [Marcar Pagado] [Cancelar] |
| PROCESSING | true | Entregar | `bg-indigo-600 hover:bg-indigo-700` | [Desmarcar Pago] [Cancelar*] |
| SERVED | false | Cobrar y Completar | `bg-green-700 hover:bg-green-800` | [Cancelar] |
| SERVED | true | Completar | `bg-green-700 hover:bg-green-800` | [Desmarcar Pago] [Cancelar*] |

Cancelar* = calls `onCancelBlocked` (shows toast "desmarca el pago primero").

- [ ] **Step 1: Add PRIMARY_CONFIGS constant above the component**

Add after `ACTIVE_STATUSES` (after line 20):

```typescript
const PRIMARY_CONFIGS: Record<string, { color: string }> = {
  CREATED: { color: 'bg-amber-500 hover:bg-amber-600' },
  CONFIRMED: { color: 'bg-blue-600 hover:bg-blue-700' },
  PROCESSING: { color: 'bg-indigo-600 hover:bg-indigo-700' },
  SERVED: { color: 'bg-green-700 hover:bg-green-800' },
};

const PRIMARY_LABELS: Record<string, string> = {
  CREATED: 'Confirmar',
  CONFIRMED: 'Procesar',
  PROCESSING: 'Entregar',
};
```

- [ ] **Step 2: Add a helper to get primary button onClick**

This is inline in JSX — no separate helper needed. The logic:
- CREATED → `onConfirm(order.id)`
- CONFIRMED → `onAdvance(order.id, 'PROCESSING')`
- PROCESSING → `onAdvance(order.id, 'SERVED')`
- SERVED + !isPaid → `onPay(order.id, selectedPaymentMethod || undefined)`
- SERVED + isPaid → `onAdvance(order.id, 'COMPLETED')`

- [ ] **Step 3: Replace the old button block**

Find and remove the entire old actions section (lines 111–185):

```tsx
        <div className="flex gap-1.5 flex-wrap pt-1">
          {order.status === 'CREATED' && (
            ...
          )}
          ...
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onCancelBlocked(order.id)}
              ...
            >
              Cancelar
            </button>
          )}
        </div>
```

Replace with:

```tsx
        {isActive && (
          <div className="border-t border-slate-200 pt-2 space-y-1.5">
            {/* Primary button */}
            <button
              type="button"
              onClick={() => {
                if (order.status === 'CREATED') onConfirm(order.id);
                else if (order.status === 'CONFIRMED') onAdvance(order.id, 'PROCESSING');
                else if (order.status === 'PROCESSING') onAdvance(order.id, 'SERVED');
                else if (order.status === 'SERVED' && !order.isPaid) onPay(order.id, selectedPaymentMethod || undefined);
                else if (order.status === 'SERVED' && order.isPaid) onAdvance(order.id, 'COMPLETED');
              }}
              className={`w-full py-2 text-sm font-bold text-white rounded-lg cursor-pointer border-none ${PRIMARY_CONFIGS[order.status]?.color ?? ''}`}
            >
              {order.status === 'SERVED'
                ? (order.isPaid ? 'Completar' : 'Cobrar y Completar')
                : PRIMARY_LABELS[order.status]}
            </button>
            {/* Secondary buttons */}
            <div className="flex gap-1.5">
              {!order.isPaid && order.status !== 'SERVED' && (
                <button
                  type="button"
                  onClick={() => onPay(order.id, selectedPaymentMethod || undefined)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-green-600 hover:bg-slate-50"
                >
                  ✓ Marcar Pagado
                </button>
              )}
              {order.isPaid && (
                <button
                  type="button"
                  onClick={() => onUnpay(order.id)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-amber-600 hover:bg-slate-50"
                >
                  ↩ Desmarcar Pago
                </button>
              )}
              {!order.isPaid && (
                <button
                  type="button"
                  onClick={() => onCancel(order.id)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-red-600 hover:bg-slate-50"
                >
                  ✕ Cancelar
                </button>
              )}
              {order.isPaid && (
                <button
                  type="button"
                  onClick={() => onCancelBlocked(order.id)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-red-600 hover:bg-slate-50"
                  title="Desmarca el pago antes de cancelar"
                >
                  ✕ Cancelar
                </button>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/ui && pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(ui): restructure OrderCard action zone into primary/secondary button rows"
```

---

## Task 6: Run and visually verify

- [ ] **Step 1: Start the UI dev server**

```bash
cd apps/ui && pnpm dev
```

Or via Docker:
```bash
docker compose up res-ui
```

- [ ] **Step 2: Open the orders dashboard**

Navigate to `http://localhost:4321/dash/orders` and log in. Verify:

1. **Column colors:** CREATED=yellow, CONFIRMED=blue, PROCESSING=indigo, SERVED=green; badge numbers are white text on solid badge
2. **Card left borders:** match column palette
3. **Active orders with no payment method:** total row shows amber ⚠ select; inactive/completed orders show text as before
4. **Primary button:** full width, solid color, bold; correct label per state
5. **Secondary buttons:** outline style, white bg, correct text color per semantic meaning
6. **SERVED + unpaid:** only one secondary button "✕ Cancelar" (no Marcar Pagado)
7. **Paid orders:** "Desmarcar Pago" (amber) + "✕ Cancelar" (red) in secondary row
8. **Marcar Pagado with selector:** select a method then click "✓ Marcar Pagado" — verify backend receives the method

- [ ] **Step 3: Final commit (if any minor fixes were needed)**

```bash
git add -p
git commit -m "fix(ui): minor visual corrections from kanban redesign review"
```
