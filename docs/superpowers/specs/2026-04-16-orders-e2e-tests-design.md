# Design: E2E Tests + Module Info — Orders / CashRegister / Kiosk

## Scope

Three controllers that form the order lifecycle:

| Controller | Base path | Auth |
|---|---|---|
| `OrdersController` | `/v1/orders` | JWT required (ADMIN/MANAGER/BASIC) |
| `CashRegisterController` | `/v1/cash-register` | JWT required (ADMIN/MANAGER) |
| `KioskController` | `/v1/kiosk` | Public (no JWT) |

Orders are created only through the kiosk (public endpoint). `/v1/orders` endpoints read and mutate order state. A CashShift must be open to create orders.

## File Structure

```
test/
├── orders/
│   ├── orders.helpers.ts
│   ├── listOrders.e2e-spec.ts
│   ├── orderHistory.e2e-spec.ts
│   ├── findOneOrder.e2e-spec.ts
│   ├── updateOrderStatus.e2e-spec.ts
│   ├── markOrderAsPaid.e2e-spec.ts
│   └── cancelOrder.e2e-spec.ts
├── cash-register/
│   ├── cash-register.helpers.ts
│   ├── openSession.e2e-spec.ts
│   ├── closeSession.e2e-spec.ts
│   ├── currentSession.e2e-spec.ts
│   ├── sessionHistory.e2e-spec.ts
│   └── sessionSummary.e2e-spec.ts
└── kiosk/
    ├── kiosk.helpers.ts
    ├── kioskStatus.e2e-spec.ts
    ├── kioskMenus.e2e-spec.ts
    ├── kioskMenuItems.e2e-spec.ts
    ├── kioskCreateOrder.e2e-spec.ts
    └── kioskOrderStatus.e2e-spec.ts

apps/api-core/src/orders/orders.module.info.md
apps/api-core/src/cash-register/cash-register.module.info.md
apps/api-core/src/kiosk/kiosk.module.info.md
```

## Helpers Pattern

Each module has its own `helpers.ts` that re-exports `bootstrapApp`, `seedRestaurant`, `login` from `products.helpers.ts` (or duplicates the pattern with module-specific seeds).

- `orders.helpers.ts` → adds `openCashShift`, `seedOrder`, `seedProduct`
- `cash-register.helpers.ts` → adds `seedProduct`
- `kiosk.helpers.ts` → adds `openCashShiftViaApi`, menu/product seeding

## Test Cases per Endpoint

### Orders

**GET /v1/orders**
- No token → 401
- BASIC, MANAGER, ADMIN → 200 array
- Isolation: only own restaurant orders visible
- `?status=CREATED` filter works

**GET /v1/orders/history**
- No token → 401
- Pagination meta correct
- Filters: status, orderNumber, dateFrom/dateTo

**GET /v1/orders/:id**
- No token → 401
- BASIC → 200 with items
- OrderWithItemsDto structure (includes items[])
- Other restaurant → 404 ORDER_NOT_FOUND

**PATCH /v1/orders/:id/status**
- No token → 401, BASIC → 403
- CREATED→PROCESSING → 200
- Invalid transition → 400 INVALID_STATUS_TRANSITION
- On cancelled order → 409 ORDER_ALREADY_CANCELLED
- Complete without payment → 409 ORDER_NOT_PAID

**PATCH /v1/orders/:id/pay**
- No token → 401, BASIC → 403
- Sets isPaid: true → 200
- Other restaurant → 404

**PATCH /v1/orders/:id/cancel**
- No token → 401, BASIC → 403
- Cancels with reason → 200, status: CANCELLED
- Already cancelled → 409 ORDER_ALREADY_CANCELLED
- On COMPLETED order → 400 INVALID_STATUS_TRANSITION

### Cash Register

**POST /v1/cash-register/open**
- No token → 401, BASIC → 403
- Opens session → 201 CashShiftDto
- Already open → 409 CASH_REGISTER_ALREADY_OPEN

**POST /v1/cash-register/close**
- No token → 401, BASIC → 403
- Closes with totals → 200 CloseSessionResponseDto
- No open session → 409 NO_OPEN_CASH_REGISTER

**GET /v1/cash-register/current**
- No token → 401
- Open session → 200 CashShiftDto
- No open session → 200 {} (empty object)

**GET /v1/cash-register/history**
- No token → 401
- Returns paginated list with meta
- Isolation by restaurant

**GET /v1/cash-register/summary/:sessionId**
- No token → 401
- Returns session + summary + orders
- topProducts sorted by quantity desc
- Session not found → 404

### Kiosk (all PUBLIC — no JWT required)

**GET /v1/kiosk/:slug/status**
- Unknown slug → 404
- No open cash shift → isOpen: false
- Open cash shift → isOpen: true

**GET /v1/kiosk/:slug/menus**
- Unknown slug → 404
- Returns available menus array

**GET /v1/kiosk/:slug/menus/:menuId/items**
- Unknown slug or menu → 404
- Returns items grouped by section

**POST /v1/kiosk/:slug/orders**
- No JWT needed (public)
- Creates order → 201
- No open cash shift → 409 REGISTER_NOT_OPEN
- Stock insufficient → 409 STOCK_INSUFFICIENT

**GET /v1/kiosk/:slug/orders/:orderId**
- Returns order status → 200
- Order not found → 404

## Module Info Files

Each module gets a `*.module.info.md` matching the format of `product.module.info.md`:
- Serialized response shape (JSON)
- Endpoints table
- E2E coverage table per case
- Implementation notes
