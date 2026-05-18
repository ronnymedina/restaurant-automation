# Spec: Kitchen & Orders Fixes

**Date:** 2026-05-18

## Overview

Four fixes across the dashboard orders view and the kitchen display, plus a backend security improvement for the kiosk order source.

---

## Issue 1 — Button text "Cobrar y Completar" (SERVED + unpaid)

**File:** `apps/ui/src/components/dash/orders/OrderCard.tsx`

**Problem:** The "Marcar Pagado" button appears for any active + unpaid order. When the order is in `SERVED` status, the backend's `markAsPaid` endpoint automatically also advances the order to `COMPLETED`. The button label does not communicate this side effect.

**Fix:** Make the button label conditional on status:
- `status === 'SERVED'` → `"Cobrar y Completar"`
- Any other active status → `"Marcar Pagado"` (unchanged)

No logic change — only the label.

---

## Issue 2 — Missing "Completar" button (SERVED + already paid)

**File:** `apps/ui/src/components/dash/orders/OrderCard.tsx`

**Problem:** When an order is `SERVED` and already `isPaid`, the card shows "Desmarcar Pago" but no button to complete the order. The `PATCH /v1/orders/:id/status` endpoint already accepts `SERVED → COMPLETED` when `isPaid` is `true`.

**Fix:** Add a "Completar" button visible only when `status === 'SERVED' && order.isPaid`. It calls `onAdvance(order.id, 'COMPLETED')`.

Button placement: beside "Desmarcar Pago", using the same style as other advance buttons.

---

## Issue 3 — Kitchen button text on PROCESSING orders

**File:** `apps/ui/src/pages/kitchen/index.astro`

**Problem:** The action button for `PROCESSING` orders says "✓ ENTREGADO", which describes the waiter's action (delivering to the table), not the cook's action (finishing cooking).

**Fix:** Change the button label from `"✓ ENTREGADO"` to `"✓ LISTO"`. No logic change — the button still advances the order to `SERVED` via the kitchen endpoint.

---

## Issue 4 — Configurable order source via query param on kiosk endpoint

**Problem:** The kiosk service hardcodes `orderSource: 'KIOSK'` for all orders created through `/v1/kiosk/{slug}/orders`. The web-based kiosk should be able to identify its orders as `WEB`. There is no mechanism to distinguish the two. Allowing `STAFF` as a source would be a security risk because `STAFF` orders are auto-confirmed.

**Backend changes** (`apps/api-core/src/kiosk/`):
- In the kiosk controller's create-order handler, read `@Query('source')` as an optional string.
- Validate it is one of `['KIOSK', 'WEB']`. If omitted, default to `'KIOSK'`. Reject `STAFF` or any unknown value with a `400 Bad Request`.
- Pass the resolved source to `kioskService.createOrder(...)` instead of hardcoding `'KIOSK'`.
- The service forwards it to `ordersService.createOrder(...)` as `orderSource`.

**Frontend changes** (`apps/ui/src/components/kiosk/store/kiosk.store.ts`):
- Append `?source=WEB` to the kiosk order creation URL: `POST /v1/kiosk/${slug}/orders?source=WEB`.

**Security guarantee:** `STAFF` is never a valid value for this endpoint. `STAFF` auto-confirms orders, which is a privilege reserved for authenticated dashboard flows.

---

## Scope

- No database migrations required.
- No new API endpoints.
- No changes to order state machine logic.
- Tests: update or add unit tests for the kiosk service/controller covering the new `source` param validation.
