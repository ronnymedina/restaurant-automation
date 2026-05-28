# Spec: Orders Kanban UI Redesign

**Date:** 2026-05-28
**Status:** Approved
**Scope:** `apps/ui` only — no API changes required

## Motivation

The current `OrderCard` mixes informational tags and action buttons in the same visual zone, making them hard to distinguish at a glance. The kanban column colors (purple/blue/orange) have no semantic meaning relative to the order's progress. Additionally, there's no way to assign a payment method to an order that was created without one.

---

## Files Affected

- `apps/ui/src/components/dash/orders/OrderCard.tsx`
- `apps/ui/src/components/dash/orders/OrdersKanban.tsx`
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx` (minor: `handlePay` signature)

---

## 1. Column Colors — P1 Palette

Replace `OrdersKanban.tsx` `COLUMNS` color tokens with the "semáforo lógico" progression:

| Status | Tailwind bg | Tailwind border | Tailwind text | Badge bg (Tailwind) |
|---|---|---|---|---|
| CREATED | `bg-yellow-50` | `border-yellow-200` | `text-yellow-800` | `bg-yellow-400` |
| CONFIRMED | `bg-blue-50` | `border-blue-200` | `text-blue-800` | `bg-blue-500` |
| PROCESSING | `bg-indigo-50` | `border-indigo-200` | `text-indigo-800` | `bg-indigo-500` |
| SERVED | `bg-green-50` | `border-green-200` | `text-green-800` | `bg-green-600` |

Badge text is always `text-white`.

The left border accent on `OrderCard` (variable `BORDER_COLORS`) also updates to match:

| Status | Border color |
|---|---|
| CREATED | `border-l-yellow-400` |
| CONFIRMED | `border-l-blue-400` |
| PROCESSING | `border-l-indigo-400` |
| SERVED | `border-l-green-500` |
| COMPLETED | `border-l-green-400` (unchanged) |
| CANCELLED | `border-l-red-400` (unchanged) |

---

## 2. Card Structure — Action Zone (S1)

Restructure the bottom of `OrderCard` into two clearly separated rows:

```
┌──────────────────────────────────────┐
│  #1                           09:51  │  ← header
│  1× Papa la horno                    │  ← items
│  ─────────────────────────────────   │
│  $5000.00              [Efectivo ▾]  │  ← total row (payment method here)
│  [No pagado] [Personal] [Para ret.]  │  ← tags
│  ══════════════════════════════════  │  ← divider (border-t)
│  [      Procesar (primary)       ]   │  ← primary button, full width
│  [✓ Marcar Pagado]  [✕ Cancelar ]   │  ← secondary buttons, outline
└──────────────────────────────────────┘
```

### Primary button
- Full width (`w-full`), solid colored, `font-bold`, `rounded-lg`, padding `py-2`
- Color varies by the action being triggered (see table below)
- Always the **only** element on its row

### Secondary buttons
- Shadcn outline style: `border border-slate-200 bg-white rounded-md`, `text-xs font-semibold`
- Each button takes `flex-1` in a flex row
- Text color carries semantic meaning; border is always neutral `border-slate-200`
- No background fill — white only

### Color tokens — consistent across tags AND buttons

| Semantic | Tag background | Tag + button text color |
|---|---|---|
| Pagado / Marcar Pagado | `bg-green-100` | `text-green-600` (`#16a34a`) |
| No pagado / Cancelar | `bg-red-100` | `text-red-600` (`#dc2626`) |
| Desmarcar Pago | `bg-amber-100` | `text-amber-600` (`#d97706`) |
| Ver datos | `bg-sky-100` | `text-sky-700` (`#0369a1`) |

Tags and their semantically matching buttons use identical color values — same token everywhere.

### Primary button color per state/action

| State | Primary action label | Button color |
|---|---|---|
| CREATED | Confirmar | `bg-amber-500 hover:bg-amber-600` |
| CONFIRMED | Procesar | `bg-blue-600 hover:bg-blue-700` |
| PROCESSING | Entregar | `bg-indigo-600 hover:bg-indigo-700` |
| SERVED (unpaid) | Cobrar y Completar | `bg-green-700 hover:bg-green-800` |
| SERVED (paid) | Completar | `bg-green-700 hover:bg-green-800` |

---

## 3. Payment Method Selector

When `order.paymentMethod` is null/undefined AND the order is in an active status (CREATED, CONFIRMED, PROCESSING, SERVED), the total row shows an inline `<select>` instead of the `—` placeholder.

**Position:** Right side of the total row (where `Efectivo` / `Tarjeta` / `—` currently appear).

**Visual style:**
- Amber-tinted to signal missing data: `border border-amber-300 bg-amber-50 text-amber-800 text-xs rounded px-1.5 py-0.5`
- Prefix `⚠` icon before the select
- Options: `— Asignar método —` (disabled placeholder), `Efectivo`, `Tarjeta`, `Digital`

**Behavior:**
- Selection is stored in local `useState<string>` inside `OrderCard` (`selectedPaymentMethod`)
- When "Marcar Pagado" is clicked, `onPay(order.id, selectedPaymentMethod || undefined)` is called, passing the selected method
- `onPay` signature changes from `(id: string) => void` to `(id: string, paymentMethod?: string) => void`
- `handlePay` in `OrdersPanel` is updated to accept and forward the `paymentMethod` to `markOrderPaid`

**When method is already defined:** Show the method label as plain text (existing behavior), no selector.

---

## 4. Button State Matrix

All active states (CREATED, CONFIRMED, PROCESSING, SERVED):

| State | `isPaid` | Primary | Secondary row |
|---|---|---|---|
| CREATED | false | Confirmar | [✓ Marcar Pagado] [✕ Cancelar] |
| CREATED | true | Confirmar | [↩ Desmarcar Pago] [✕ Cancelar*] |
| CONFIRMED | false | Procesar | [✓ Marcar Pagado] [✕ Cancelar] |
| CONFIRMED | true | Procesar | [↩ Desmarcar Pago] [✕ Cancelar*] |
| PROCESSING | false | Entregar | [✓ Marcar Pagado] [✕ Cancelar] |
| PROCESSING | true | Entregar | [↩ Desmarcar Pago] [✕ Cancelar*] |
| SERVED | false | Cobrar y Completar | [✕ Cancelar] |
| SERVED | true | Completar | [↩ Desmarcar Pago] [✕ Cancelar*] |

`✕ Cancelar*` = when paid, the cancel button calls `onCancelBlocked` (existing behavior — shows a message telling the user to unmark payment first).

---

## 5. Out of Scope

- Standalone "update payment method" API endpoint — not needed; method is sent when marking as paid via the existing `/v1/orders/:id/pay` endpoint.
- Any changes to `OrdersFilteredList` (history view) — not affected.
- Any changes to the API layer beyond `handlePay` signature in `OrdersPanel`.
