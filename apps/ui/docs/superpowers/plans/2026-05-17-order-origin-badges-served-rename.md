# Order Origin Badges + SERVED Column Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the misleading "Entregado" SERVED label to "Listo para servir o entregar", add `orderSource`/`orderType` badges to every order card, and make those columns non-nullable in the DB.

**Architecture:** Pure UI label/badge additions in three React components plus one Prisma schema migration. The migration uses `--create-only` so we can prepend UPDATE statements before applying, safely handling any existing NULL rows.

**Tech Stack:** React (TSX), Tailwind CSS, Prisma ORM, PostgreSQL, Docker Compose

---

## File Map

| File | Change |
|------|--------|
| `apps/ui/src/components/dash/orders/OrdersKanban.tsx` | Rename SERVED label in `COLUMNS` array |
| `apps/ui/src/components/dash/orders/OrderFilterPanel.tsx` | Rename SERVED label in `STATUS_LABELS` map |
| `apps/ui/src/components/dash/orders/api.ts` | Add `orderSource` and `orderType` to `Order` interface |
| `apps/ui/src/components/dash/orders/OrderCard.tsx` | Add two badge maps + render badges in badge row |
| `apps/api-core/prisma/schema.postgresql.prisma` | Remove `?` from `orderSource` and `orderType` |
| `apps/api-core/prisma/migrations/<timestamp>_make_order_source_type_required/migration.sql` | Generated — edit to prepend UPDATE statements |

---

### Task 1: Rename SERVED Label in Kanban and Filter Panel

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersKanban.tsx:32`
- Modify: `apps/ui/src/components/dash/orders/OrderFilterPanel.tsx:8`

- [ ] **Step 1: Update `OrdersKanban.tsx`**

In the `COLUMNS` array, change the `SERVED` entry's `label`:

```tsx
  {
    status: 'SERVED',
    label: 'Listo para servir o entregar',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    badgeBg: 'bg-orange-200',
  },
```

- [ ] **Step 2: Update `OrderFilterPanel.tsx`**

In `STATUS_LABELS`, change the `SERVED` entry:

```ts
const STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: 'Creado',
  CONFIRMED: 'Confirmado',
  PROCESSING: 'En Proceso',
  SERVED: 'Listo para servir o entregar',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};
```

- [ ] **Step 3: Verify TypeScript**

```bash
docker compose exec res-ui pnpm build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersKanban.tsx \
        apps/ui/src/components/dash/orders/OrderFilterPanel.tsx
git commit -m "feat(ui): rename SERVED column label to 'Listo para servir o entregar'"
```

---

### Task 2: Extend Order Interface with orderSource and orderType

**Files:**
- Modify: `apps/ui/src/components/dash/orders/api.ts:13-25`

- [ ] **Step 1: Add fields to the `Order` interface**

The current `Order` interface (lines 13–25) lacks `orderSource` and `orderType`. Replace it with:

```ts
export interface Order {
  id: string;
  orderNumber: number;
  cashShiftId: string;
  status: string;
  totalAmount: number;
  isPaid: boolean;
  paymentMethod?: string;
  cancellationReason?: string;
  orderSource: string;
  orderType: string;
  createdAt: string;
  displayTime?: string;
  items: OrderItem[];
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
docker compose exec res-ui pnpm build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/api.ts
git commit -m "feat(ui): add orderSource and orderType to Order interface"
```

---

### Task 3: Add Origin Badges to OrderCard

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`

- [ ] **Step 1: Add lookup maps**

After the existing `BORDER_COLORS` and `ACTIVE_STATUSES` declarations (around line 16), add:

```ts
const ORDER_SOURCE_LABELS: Record<string, string> = {
  KIOSK: 'Kiosko',
  WEB: 'Web',
  STAFF: 'Personal',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: 'En mesa',
  PICKUP: 'Para retirar',
  DELIVERY: 'Delivery',
};
```

- [ ] **Step 2: Render badges in the badge row**

The existing badge row (lines 67–77) currently renders only the "Pagado"/"No pagado" badge:

```tsx
        <div className="flex items-center gap-2">
          {order.isPaid ? (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">
              Pagado
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
              No pagado
            </span>
          )}
        </div>
```

Replace that block with:

```tsx
        <div className="flex items-center gap-2 flex-wrap">
          {order.isPaid ? (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">
              Pagado
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
              No pagado
            </span>
          )}
          <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-slate-100 text-slate-600">
            {ORDER_SOURCE_LABELS[order.orderSource] ?? order.orderSource}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-slate-100 text-slate-600">
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </span>
        </div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
docker compose exec res-ui pnpm build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(ui): add orderSource and orderType badges to OrderCard"
```

---

### Task 4: Prisma Migration — Make orderSource and orderType Required

**Files:**
- Modify: `apps/api-core/prisma/schema.postgresql.prisma:201-202`
- Create: `apps/api-core/prisma/migrations/<timestamp>_make_order_source_type_required/migration.sql`

- [ ] **Step 1: Update the Prisma schema**

In the `Order` model (around line 201–202), remove the `?` from both fields:

```prisma
  orderSource        String
  orderType          String
```

- [ ] **Step 2: Generate migration file without applying**

Run inside Docker so Prisma can reach the live database:

```bash
docker compose exec res-api-core pnpm exec prisma migrate dev \
  --create-only \
  --name make_order_source_type_required
```

Expected output: `Prisma Migrate created the following migration without applying it: .../make_order_source_type_required/migration.sql`

Note the timestamp prefix in the output — you'll need it in the next step.

- [ ] **Step 3: Edit the generated migration file**

Open `apps/api-core/prisma/migrations/<timestamp>_make_order_source_type_required/migration.sql`.

Prisma generated only the ALTER TABLE. Prepend the two UPDATE statements so NULLs are backfilled before the NOT NULL constraint is added:

```sql
-- Backfill existing NULL rows before enforcing NOT NULL
UPDATE "Order" SET "orderSource" = 'WEB' WHERE "orderSource" IS NULL;
UPDATE "Order" SET "orderType" = 'PICKUP' WHERE "orderType" IS NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "orderSource" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "orderType" SET NOT NULL;
```

- [ ] **Step 4: Apply the migration**

```bash
docker compose exec res-api-core pnpm exec prisma migrate dev
```

Expected: migration is applied and Prisma client is regenerated. Output ends with `Your database is now in sync with your schema.`

- [ ] **Step 5: Verify schema state**

```bash
docker compose exec res-api-core pnpm exec prisma migrate status
```

Expected: all migrations are applied, no drift.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/prisma/schema.postgresql.prisma \
        apps/api-core/prisma/migrations/
git commit -m "feat(api-core): make orderSource and orderType NOT NULL with backfill migration"
```
