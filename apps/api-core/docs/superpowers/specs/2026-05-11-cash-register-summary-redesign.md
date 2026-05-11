# Cash Register Summary Redesign

**Date:** 2026-05-11
**Scope:** `apps/api-core/src/cash-register/` + `apps/ui/src/components/dash/register/api.ts`

## Problem

The cash register summary endpoints calculate `totalSales` and `paymentBreakdown` over **all** orders in a session regardless of status — including `CREATED` (pending), `PROCESSING` (in kitchen), and `CANCELLED`. This inflates reported totals with money that was never collected.

---

## Changes

### 1. `POST /cash-register/close` — fix totalSales

**File:** `cash-register.service.ts` → `closeSession()`

- Change the `order.aggregate` and `order.groupBy` queries to filter `status: OrderStatus.COMPLETED` only.
- `totalSales` persisted on `cashShift` reflects only completed (paid) orders.
- `totalOrders` persisted on `cashShift` reflects only completed orders count.
- Response shape is unchanged: `{ session, summary: { totalOrders, totalSales, paymentBreakdown } }`.

### 2. `GET /cash-register/summary/:sessionId` — redesign breakdown

**File:** `cash-register.service.ts` → `getSessionSummary()`

Replace the current in-memory loop aggregation with a single Prisma `groupBy` on `status`:

```ts
prisma.order.groupBy({
  by: ['status'],
  where: { cashShiftId: session.id },
  _sum: { totalAmount: true },
  _count: { id: true },
})
```

**New response shape for `summary`:**

```ts
{
  ordersByStatus: {
    CREATED:    { count: number; total: number };
    PROCESSING: { count: number; total: number };
    COMPLETED:  { count: number; total: number };
    CANCELLED:  { count: number; total: number };
  };
  totalSales: number;          // CREATED + PROCESSING + COMPLETED (excludes CANCELLED)
  totalOrders: number;         // all orders in session
  paymentBreakdown: Record<string, { count: number; total: number }>; // COMPLETED only
  // topProducts removed — moved to dedicated endpoint
}
```

- Remove `completedOrders` and `cancelledOrders` flat fields (replaced by `ordersByStatus`).
- Remove `topProducts` from this response.
- The `orders` array (full order list) stays in the response unchanged.
- `paymentBreakdown` is computed only from `COMPLETED` orders via a filtered `groupBy`.

### 3. New endpoint — `GET /cash-register/top-products/:sessionId`

Extract top-products logic from `getSessionSummary` into a dedicated service method and controller action.

**Service:** `getTopProducts(sessionId: string)`
- Runs the existing `orderItem.groupBy` query (exclude `CANCELLED` orders).
- Returns top 5 products by quantity.
- Throws `CashRegisterNotFoundException` if session not found.

**Controller:**
```ts
@Get('top-products/:sessionId')
async topProducts(@Param('sessionId') sessionId: string) { ... }
```

**Response:**
```ts
{
  topProducts: Array<{ id: string; name: string; quantity: number; total: number }>;
}
```

### 4. Serializers para las respuestas de summary

El módulo `cash-register` ya tiene `cash-shift.serializer.ts` para la sesión, pero las respuestas de summary (`closeSession` y `getSessionSummary`) se devuelven como objetos planos sin serializer — diferente al patrón del resto del proyecto (ver `apps/api-core/src/products/serializers/`).

**Crear `serializers/session-summary.serializer.ts`** con clases que usen `@Expose`, `@Exclude`, `@Transform` como los demás módulos.

**Conversión de dinero:** Todos los campos monetarios deben usar `fromCents()` de `src/common/helpers/money.ts`, no `Number()` directo. Los valores en DB están en centavos (BigInt); el frontend espera pesos decimales.

Campos afectados:
- `summary.totalSales` → `fromCents(bigint)`
- `summary.ordersByStatus.*.total` → `fromCents(bigint)` por cada grupo
- `summary.paymentBreakdown.*.total` → `fromCents(bigint)` por cada método
- `topProducts[].total` → `fromCents(bigint)`

El serializer existente `CashShiftSerializer` ya convierte `totalSales` y `openingBalance` con `Number()` directo — **corregir** para usar `fromCents()`.

### 5. Frontend types — `apps/ui/src/components/dash/register/api.ts`

Update `SessionDetailSummary` to match the new API response:

```ts
export interface OrderStatusGroup {
  count: number;
  total: number;
}

export interface SessionDetailSummary {
  ordersByStatus: {
    CREATED: OrderStatusGroup;
    PROCESSING: OrderStatusGroup;
    COMPLETED: OrderStatusGroup;
    CANCELLED: OrderStatusGroup;
  };
  totalSales: number;
  totalOrders: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
}
```

Remove `completedOrders`, `cancelledOrders`, and `topProducts` from this interface.

Add a new `getTopProducts(sessionId: string)` API function that calls `GET /v1/cash-register/top-products/:sessionId`.

---

## Files Changed

| File | Change |
|------|--------|
| `cash-register.service.ts` | Fix `closeSession` queries; redesign `getSessionSummary`; add `getTopProducts` |
| `cash-register.controller.ts` | Add `GET top-products/:sessionId` route |
| `cash-register-session.repository.ts` | No changes needed |
| `order.repository.ts` | No changes needed |
| `dto/cash-register-response.dto.ts` | Update DTOs para `SessionSummaryResponseDto` y nuevo `TopProductsResponseDto` |
| `serializers/session-summary.serializer.ts` | Nuevo — serializer para respuestas de summary con `fromCents()` |
| `serializers/cash-shift.serializer.ts` | Corregir `totalSales` y `openingBalance` para usar `fromCents()` |
| `apps/ui/.../register/api.ts` | Update `SessionDetailSummary`; add `getTopProducts` function |

---

## E2E Tests

### `POST /cash-register/close`
- **200** — sesión cerrada; `summary.totalSales` refleja solo `COMPLETED`; `summary.paymentBreakdown` solo métodos de `COMPLETED`
- **409 `NO_OPEN_CASH_REGISTER`** — no hay sesión abierta
- **409 `PENDING_ORDERS_ON_SHIFT`** — hay órdenes en `CREATED` o `PROCESSING`; respuesta incluye `details.pendingCount`

### `GET /cash-register/summary/:sessionId`
- **200** — respuesta contiene:
  - `summary.ordersByStatus` con las cuatro claves (`CREATED`, `PROCESSING`, `COMPLETED`, `CANCELLED`), cada una con `count` (número) y `total` (pesos decimales)
  - `summary.totalSales` = suma de `CREATED + PROCESSING + COMPLETED` en pesos decimales
  - `summary.totalOrders` = total de órdenes en sesión
  - `summary.paymentBreakdown` = solo métodos de `COMPLETED`
  - `orders` = array de órdenes completas
  - Claves `completedOrders` y `cancelledOrders` ya NO presentes
- **404 `CASH_REGISTER_NOT_FOUND`** — sessionId inválido

### `GET /cash-register/top-products/:sessionId`
- **200** — `topProducts` array, máx 5 elementos, cada uno con `id`, `name`, `quantity`, `total` (pesos decimales); excluye ítems de órdenes `CANCELLED`
- **404 `CASH_REGISTER_NOT_FOUND`** — sessionId inválido

---

### 6. Actualizar `cash-register.module.info.md`

Después de implementar los cambios, actualizar `apps/api-core/src/cash-register/cash-register.module.info.md`:

- **`CloseSessionResponseDto`** — `summary.totalSales` y `summary.paymentBreakdown` ahora reflejan solo `COMPLETED`. Actualizar el JSON de ejemplo.
- **`SessionSummaryResponseDto`** — reemplazar el JSON de ejemplo con la nueva forma: `ordersByStatus`, quitar `completedOrders`/`cancelledOrders`/`topProducts`.
- **Nuevo `TopProductsResponseDto`** — agregar JSON de ejemplo para `GET /top-products/:sessionId`.
- **Tabla de endpoints** — agregar la nueva ruta `GET /v1/cash-register/top-products/:sessionId`.
- **Sección E2E de `summary`** — actualizar los casos de prueba para reflejar la nueva estructura de respuesta (quitar `completedOrders`, `cancelledOrders`, `topProducts`; agregar `ordersByStatus`).
- **Sección E2E de `close`** — agregar caso: `summary.totalSales` refleja solo `COMPLETED`.
- **Nueva sección E2E para `top-products`** — casos: 200 con array, 404 sesión no encontrada, órdenes `CANCELLED` excluidas.
- **Notas de implementación** — corregir la nota sobre `Number()` para mencionar `fromCents()`.

---

## Out of Scope

- Changes to `GET /cash-register/current` — used only to check open/closed state, no summary needed.
- Changes to `GET /cash-register/history` — returns the session list, not order details.
- UI component changes (RegisterSummaryModal, RegisterHistoryIsland) — handled separately once API is stable.
