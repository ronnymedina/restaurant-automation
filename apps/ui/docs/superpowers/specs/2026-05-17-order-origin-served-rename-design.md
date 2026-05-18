# Spec: Order Origin Badges + SERVED Column Rename

**Date:** 2026-05-17

## Context

The `SERVED` order state means "out of the kitchen, ready to be handed to the customer." The current label "Entregado" (Delivered) is misleading — it implies the customer already received the order, which isn't the case.

Additionally, orders can come from different sources (`KIOSK`, `WEB`, `STAFF`) and have different fulfillment types (`DINE_IN`, `PICKUP`, `DELIVERY`), but this information is not visible in the dashboard's order cards.

## Goals

1. Rename the SERVED column in the Kanban to a label that accurately reflects the state.
2. Show `orderSource` and `orderType` as badges on each order card.
3. Make `orderSource` and `orderType` required (non-nullable) in the database.

## Out of Scope

- Changes to SSE event payloads (they intentionally send empty data; the UI refetches via REST).
- Kitchen display changes.

---

## Part 1 — SERVED Column Rename

**Files:**
- `apps/ui/src/components/dash/orders/OrdersKanban.tsx`
- `apps/ui/src/components/dash/orders/OrderFilterPanel.tsx`

**Change:** `'Entregado'` → `'Listo para servir o entregar'` in both files (Kanban column header and filter panel `STATUS_LABELS`).

---

## Part 2 — Prisma Migration

**Schema file:** `apps/api-core/prisma/schema.postgresql.prisma`

Change in the `Order` model:
```prisma
// Before
orderSource String?
orderType   String?

// After
orderSource String
orderType   String
```

**Migration SQL** (applied via `prisma migrate dev`):
```sql
-- Set defaults for existing NULL rows
UPDATE "Order" SET "orderSource" = 'WEB' WHERE "orderSource" IS NULL;
UPDATE "Order" SET "orderType" = 'PICKUP' WHERE "orderType" IS NULL;

-- Make columns required
ALTER TABLE "Order" ALTER COLUMN "orderSource" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "orderType" SET NOT NULL;
```

---

## Part 3 — UI: Order Interface

**File:** `apps/ui/src/components/dash/orders/api.ts`

Add to the `Order` interface:
```ts
orderSource: string;
orderType: string;
```

---

## Part 4 — OrderCard: Origin Badges

**File:** `apps/ui/src/components/dash/orders/OrderCard.tsx`

Add two lookup maps and render two badges in the existing badge row (alongside "Pagado" / "No pagado").

**Label maps:**

| Field | Value | Label |
|---|---|---|
| `orderSource` | `KIOSK` | Kiosko |
| `orderSource` | `WEB` | Web |
| `orderSource` | `STAFF` | Personal |
| `orderType` | `DINE_IN` | En mesa |
| `orderType` | `PICKUP` | Para retirar |
| `orderType` | `DELIVERY` | Delivery |

Badges use the same `px-2 py-0.5 text-xs rounded-full font-medium` style already present in the card, with neutral slate colors to distinguish them from the payment status badge.

---

## Acceptance Criteria

- [ ] Kanban column header and filter dropdown both show "Listo para servir o entregar" for SERVED orders.
- [ ] Migration runs cleanly; `orderSource` and `orderType` are NOT NULL in the DB.
- [ ] Every order card in the Kanban shows two badges: one for source and one for type.
- [ ] Badge labels are in Spanish as per the table above.
- [ ] No TypeScript errors introduced.
