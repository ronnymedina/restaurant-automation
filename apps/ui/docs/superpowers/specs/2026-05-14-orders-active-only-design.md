# Orders Panel: Active Orders Only

**Date:** 2026-05-14  
**Status:** Approved

## Problem

The `GET /v1/orders` endpoint has a hardcoded limit of 30 records shared across all statuses (CREATED, PROCESSING, COMPLETED, CANCELLED). When a shift accumulates many completed or cancelled orders, the active orders (CREATED, PROCESSING) can be displaced or completely absent from the panel. Staff cannot see what needs attention.

## Goal

The orders panel (`/dash/orders`) focuses exclusively on active orders (CREATED and PROCESSING) by default. Completed and cancelled orders are accessible only through the history page (`/dash/orders-history`). The filter panel retains all four statuses so staff can search within the current session.

## Approach: Multi-status query param + frontend cleanup

### Backend — `GET /v1/orders`

**New query param `statuses[]`**  
Accepts an array of `OrderStatus` values serialized as repeated query params:  
`?statuses[]=CREATED&statuses[]=PROCESSING`

- The existing singular `status` param is preserved for backward compatibility; internally it is merged into the `statuses` array.
- No change to the default behavior when neither param is provided.
- **Limit raised from 30 to 100** (`Math.min(100, ...)` in `GetOrdersDto`).

**Files changed:**
- `apps/api-core/src/orders/dto/order.dto.ts` — add `@IsOptional() @IsEnum(OrderStatus, { each: true }) statuses?: OrderStatus[]`; raise max limit to 100
- `apps/api-core/src/orders/orders.service.ts` — merge `status` + `statuses` into a single array before calling the repository
- `apps/api-core/src/orders/orders.controller.ts` — pass `statuses` array to service

`order.repository.ts` already supports a `statuses` array — no changes needed there.

### Frontend — `apps/ui/src/components/dash/orders/`

**`api.ts`**  
Update `getOrders()` to accept `statuses?: OrderStatus[]` and serialize as `statuses[]=X&statuses[]=Y`.

**`OrdersPanel.tsx`**  
- Default query: `statuses: ['CREATED', 'PROCESSING'], limit: 100`
- When a filter with explicit statuses is applied, those statuses are sent to the backend directly — no client-side status filtering.

**`OrdersKanban.tsx`**  
- Remove the secondary collapsible columns (COMPLETED, CANCELLED).
- Kanban renders only two columns: CREATED and PROCESSING.

**`OrderFilterPanel.tsx`**  
- Keep all four status checkboxes so staff can search COMPLETED/CANCELLED within the current session.
- On submit, selected statuses go to the backend as `statuses[]`.
- If no status is selected and there is no other criterion, defaults to `['CREATED', 'PROCESSING']`.

**`OrdersFilteredList.tsx`**  
- Add a footer note when result count equals 100 (the limit):  
  *"Se muestran los primeros 100 pedidos. Para ver el historial completo, [ve al historial de pedidos →]."*  
  The link points to `/dash/orders-history`.
- The note is hidden when results are below 100.

**No changes:** `orders.astro`, `orders-history.astro`, `OrdersFilteredList.tsx` (structure only, note added).

## Data flow

```
OrdersPanel mounts
  → loadOrders({ statuses: [CREATED, PROCESSING], cashShiftId, limit: 100 })
  → GET /v1/orders?statuses[]=CREATED&statuses[]=PROCESSING&cashShiftId=...&limit=100
  → OrdersKanban renders CREATED | PROCESSING columns

User opens filter, selects COMPLETED + orderNumber
  → loadOrders({ statuses: [COMPLETED], orderNumber: 42, cashShiftId, limit: 100 })
  → GET /v1/orders?statuses[]=COMPLETED&orderNumber=42&cashShiftId=...&limit=100
  → OrdersFilteredList renders results (+ footer if count = 100)
```

## Out of scope

- Pagination on the active orders panel — 100 is sufficient for a single shift.
- Any changes to `orders-history.astro`.
- SSE behavior is unchanged (reloads kanban on new/updated orders, skipped in filter mode).
