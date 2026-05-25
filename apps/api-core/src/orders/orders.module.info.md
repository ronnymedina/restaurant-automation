
### Orders (orders)

### Respuesta serializada

**OrderDto** — usado en PATCH /:id/status, PATCH /:id/pay, PATCH /:id/cancel:

```json
{
  "id": "string",
  "orderNumber": 1,
  "status": "CREATED | PROCESSING | SERVED | COMPLETED | CANCELLED",
  "paymentMethod": "CASH | CARD | null",
  "customerEmail": "string | null",
  "customerName": "string | null",
  "customerPhone": "string | null",
  "deliveryAddress": "string | null",
  "deliveryReferences": "string | null",
  "totalAmount": 12.5,
  "isPaid": false,
  "cancellationReason": "string | null",
  "restaurantId": "string",
  "cashShiftId": "string",
  "createdAt": "ISO8601",
  "displayTime": "HH:MM",
  "updatedAt": "ISO8601"
}
```

**OrderWithItemsDto** — usado en GET /:id (igual + items[]):

```json
{
  "id": "string",
  "orderNumber": 1,
  "status": "CREATED | PROCESSING | SERVED | COMPLETED | CANCELLED",
  "paymentMethod": "CASH | CARD | null",
  "customerEmail": "string | null",
  "totalAmount": 12.5,
  "isPaid": false,
  "cancellationReason": "string | null",
  "restaurantId": "string",
  "cashShiftId": "string",
  "createdAt": "ISO8601",
  "displayTime": "HH:MM",
  "updatedAt": "ISO8601",
  "items": [
    {
      "id": "string",
      "orderId": "string",
      "productId": "string",
      "menuItemId": "string | null",
      "quantity": 2,
      "unitPrice": 6.25,
      "subtotal": 12.5,
      "notes": "string | null",
      "createdAt": "ISO8601"
    }
  ]
}
```

**Historia paginada** — usado en GET /history:

```json
{
  "data": [ /* OrderDto[] */ ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Endpoints

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/orders` | ADMIN, MANAGER, BASIC | `OrderDto[]` | Listar órdenes del restaurante (filtro por status y limit) |
| `GET` | `/v1/orders/history` | ADMIN, MANAGER, BASIC | `{ data: OrderDto[], meta }` | Historial paginado con filtros |
| `GET` | `/v1/orders/:id` | ADMIN, MANAGER, BASIC | `OrderWithItemsDto` | Obtener orden por ID con items |
| `POST` | `/v1/orders` | ADMIN, MANAGER | `{ order, receipt, kitchenTicket }` (201) | Crear pedido desde el dashboard (orderSource: STAFF) |
| `PATCH` | `/v1/orders/:id/status` | ADMIN, MANAGER | `OrderDto` | Avanzar estado de la orden |
| `PATCH` | `/v1/orders/:id/pay` | ADMIN, MANAGER | `OrderDto` | Marcar orden como pagada. Body opcional: `{ paymentMethod? }` |
| `PATCH` | `/v1/orders/:id/cancel` | ADMIN, MANAGER | `OrderDto` | Cancelar una orden |

---

#### List — `GET /v1/orders`

E2E: ✅ `test/orders/listOrders.e2e-spec.ts`

Query params:
- `statuses` (opcional, repetible) — filtra por uno o más estados. Ejemplo: `statuses=CREATED&statuses=PROCESSING`
- `orderNumber` (opcional) — filtra por número de orden (coincidencia exacta)
- `limit` (opcional) — máximo de registros a retornar (default `100`, max `100`)

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede listar | 200 | Retorna array de `OrderDto` |
| MANAGER puede listar | 200 | Retorna array de `OrderDto` |
| BASIC puede listar | 200 | Retorna array de `OrderDto` |
| Con `?statuses=CREATED` | 200 | Filtra por un estado |
| Con `?statuses=CREATED&statuses=PROCESSING` | 200 | Filtra por múltiples estados |
| Con `?limit=100` | 200 | Retorna máximo 100 pedidos más recientes |
| Sin `?limit` | 200 | Retorna máximo 100 pedidos (default) |
| Con `?statuses=INVALID` | 400 | Valor de estado inválido |
| Sin caja abierta | 409 | `{ code: "REGISTER_NOT_OPEN" }` |
| Solo órdenes del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |
| `totalAmount` como number | 200 | BigInt serializado a number |

---

#### History — `GET /v1/orders/history`

E2E: ✅ `test/orders/orderHistory.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede consultar historial | 200 | Retorna `{ data, meta }` |
| MANAGER puede consultar historial | 200 | Retorna `{ data, meta }` |
| BASIC puede consultar historial | 200 | Retorna `{ data, meta }` |
| Con `?page=1&limit=5` | 200 | Paginación correcta en `meta` |
| Con `?status=COMPLETED` | 200 | Filtra por estado |
| Con `?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD` | 200 | Filtra por rango de fechas |
| Con `?orderNumber=1` | 200 | Filtra por número de orden |
| Solo órdenes del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |

---

#### Find One — `GET /v1/orders/:id`

E2E: ✅ `test/orders/findOneOrder.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede obtener | 200 | Retorna `OrderWithItemsDto` |
| MANAGER puede obtener | 200 | Retorna `OrderWithItemsDto` |
| BASIC puede obtener | 200 | Retorna `OrderWithItemsDto` |
| Estructura `OrderWithItemsDto` | 200 | totalAmount, unitPrice, subtotal como number |
| Orden no existe | 404 | `ORDER_NOT_FOUND` |
| Orden de otro restaurante | 404 | Aislamiento — `findById(id, restaurantId)` lanza excepción |

---

#### Update Status — `PATCH /v1/orders/:id/status`

E2E: ✅ `test/orders/updateOrderStatus.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| ADMIN avanza CREATED → PROCESSING | 200 | Retorna `OrderDto` actualizado |
| MANAGER avanza PROCESSING → SERVED | 200 | Sin requerir pago |
| MANAGER avanza SERVED → COMPLETED (isPaid = true) | 200 | Requiere `isPaid = true` para COMPLETED |
| Avanzar SERVED → COMPLETED sin pagar | 400 | `ORDER_NOT_PAID` |
| Retroceder estado | 400 | `INVALID_STATUS_TRANSITION` |
| Orden CANCELLED no puede avanzar | 400 | `ORDER_ALREADY_CANCELLED` |
| Orden no existe | 404 | `ORDER_NOT_FOUND` |
| Orden de otro restaurante | 404 | Aislamiento |

---

#### Mark as Paid — `PATCH /v1/orders/:id/pay`

E2E: ✅ `test/orders/markOrderAsPaid.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta marcar | 403 | Solo ADMIN o MANAGER |
| ADMIN marca como pagada | 200 | Retorna `OrderDto` con `isPaid = true` |
| MANAGER marca como pagada | 200 | Retorna `OrderDto` con `isPaid = true` |
| Marcar segunda vez | 200 | Idempotente — `isPaid` sigue en `true` |
| Orden no existe | 404 | `ORDER_NOT_FOUND` |
| Orden de otro restaurante | 404 | Aislamiento |

---

#### Cancel — `PATCH /v1/orders/:id/cancel`

E2E: ✅ `test/orders/cancelOrder.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta cancelar | 403 | Solo ADMIN o MANAGER |
| ADMIN cancela orden CREATED | 200 | Retorna `OrderDto` con `status = CANCELLED` |
| MANAGER cancela orden PROCESSING | 200 | Retorna `OrderDto` con `status = CANCELLED` |
| Cancelar orden ya CANCELLED | 400 | `ORDER_ALREADY_CANCELLED` |
| Cancelar orden COMPLETED | 400 | `INVALID_STATUS_TRANSITION` |
| Orden no existe | 404 | `ORDER_NOT_FOUND` |
| Orden de otro restaurante | 404 | Aislamiento |

---

#### Create from Dashboard — `POST /v1/orders`

E2E: ✅ `test/orders/createOrderFromDashboard.e2e-spec.ts`

---

### Flujo de creación de pedido desde el dashboard (STAFF)

```mermaid
flowchart TD
    A([Staff abre modal\n"Nuevo pedido"]) --> B[Busca producto por texto\nGET /v1/products?search=…]
    B --> C[Agrega productos al carrito\nZustand store · addItem]

    C --> D{¿Carrito vacío?}
    D -- Sí --> E[Botón 'Siguiente' deshabilitado\nUI validation]
    E --> C
    D -- No --> F

    subgraph PASO2 ["Paso 2 — Datos del pedido"]
        F[Selecciona tipo de entrega\nPICKUP · DINE_IN · DELIVERY]
        F --> G{Validación Zod\nreact-hook-form}
        G -- DINE_IN sin mesa --> H[Error: Número de mesa requerido]
        G -- DELIVERY sin dirección --> I[Error: Dirección requerida]
        H --> F
        I --> F
        G -- OK --> J[Click 'Confirmar pedido']
    end

    J --> K[POST /v1/orders\nBearer JWT]

    subgraph BACKEND ["Backend — Guards + Servicio"]
        K --> L{JwtAuthGuard}
        L -- Inválido --> M[401 Unauthorized]
        L -- Válido --> N{RolesGuard\nADMIN · MANAGER}
        N -- BASIC --> O[403 Forbidden]
        N -- OK --> P{¿Caja abierta?\nCashShiftRepository}
        P -- No --> Q[409 REGISTER_NOT_OPEN]
        P -- Sí --> R{¿DTO válido?\nDelivery → address req.}
        R -- No --> S[400 Validation Error]
        R -- Sí --> T

        subgraph TX ["$transaction — Prisma"]
            T[Incrementa orderNumber] --> U[Valida stock por producto]
            U -- Sin stock --> V[409 STOCK_INSUFFICIENT]
            U -- OK --> W[Decrementa stock\nrow-level lock ordenado por productId]
            W --> X[Persiste Order\norderSource: STAFF forzado\nstatus: CONFIRMED]
            X --> Y[Persiste OrderItems\nmenuItemId: null\nunitPrice = product.price]
        end
    end

    Y --> Z[Emite SSE order:created\nKanban se actualiza]
    Z --> AA[Print kitchen ticket\nfire-and-forget]
    AA --> AB([Respuesta 201\norder.status: CONFIRMED\norder.orderSource: STAFF])

    AB --> AC[Toast: Pedido #N creado\nModal se cierra · Store reseteado]

    AC -.->|Más tarde| AD[Staff cobra al cliente\nPATCH /v1/orders/:id/pay\nbody: paymentMethod opcional]
    AD --> AE{¿paymentMethod\nen body?}
    AE -- Sí con valor inválido --> AF[400 Bad Request\n@IsEnum PaymentMethod]
    AE -- Sí válido --> AG[Actualiza paymentMethod\nen la orden]
    AE -- No --> AH[paymentMethod queda null]
    AG --> AI([200 OK · isPaid: true])
    AH --> AI
```

---

### Notas de implementación

- `GET /v1/orders` resuelve el turno activo internamente desde el `restaurantId` del JWT. Si no hay caja abierta devuelve 409 `REGISTER_NOT_OPEN`. Aplica `limit` de 100 por defecto (máximo 100). Para reportes históricos completos usar `/history`
- `displayTime` se formatea en el timezone del restaurante server-side. El campo `createdAt` se mantiene en ISO8601
- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `totalAmount`, `unitPrice` y `subtotal` se almacenan como `BigInt` en PostgreSQL (centavos). El helper `serializeOrder` (en `order.repository.ts`) aplica `fromCents` antes de devolver, de modo que la respuesta JSON expone los montos en **pesos** (decimal). Mismo criterio para `items[].product.price` y `items[].menuItem.priceOverride`. JSON no soporta `BigInt` nativo.
- **`CreateOrderDto.expectedTotal`** acepta `number` en pesos en la request, pero internamente se transforma a `bigint` centavos vía `@Transform(toCents)`. La validación `validateExpectedTotal` compara `BigInt(totalAmount) === expectedTotal` exactamente (centavos vs centavos), sin tolerancia de coma flotante. Antes existía un mismatch de unidades entre kiosk (centavos) y backend (centavos) que pasaba por accidente; ver H-01 en `docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`.
- Máquina de estados de orden:
  - Flujo normal: `CREATED → PROCESSING → SERVED → COMPLETED`
  - Cancelación: `CREATED` o `PROCESSING → CANCELLED`
  - `COMPLETED` no puede cancelarse
  - `CANCELLED` no puede avanzar
  - Retroceder el estado lanza `INVALID_STATUS_TRANSITION`
  - Dashboard transiciones:
    - `PROCESSING → SERVED` sin requerir pago
    - `SERVED → COMPLETED` requiere `isPaid = true`, de lo contrario lanza `ORDER_NOT_PAID`
  - Kitchen máximo: `PROCESSING → SERVED` (no puede avanzar a `COMPLETED`)
- El endpoint `PATCH /:id/pay` es independiente del flujo de estado — se puede marcar como pagada en cualquier estado
- Al marcar como pagada (`PATCH /:id/pay`), si la orden está en estado `SERVED`, se auto-avanza automáticamente a `COMPLETED`
- La creación de órdenes puede realizarse desde el kiosk (`POST /v1/kiosk/:slug/orders`, público) o desde el dashboard (`POST /v1/orders`, autenticado ADMIN/MANAGER). Los pedidos de staff usan `orderSource: 'STAFF'` (forzado en el servicio) e inician en estado `CONFIRMED`
- Al crear una orden (kiosk), se emite evento `order:created` por WebSocket; al actualizar estado se emite `order:updated`
- Al marcar como pagada, se dispara de forma asíncrona la impresión de recibo y el envío de email si `customerEmail` está presente
- El historial aplica `dateTo` con hora `23:59:59.999` para incluir el día completo
- La asignación de `orderNumber` usa una transacción corta separada antes de la transacción principal de creación de orden, para evitar contención en `CashShift.lastOrderNumber`. Ver `src/cash-register/cash-register.module.info.md` y `docs/superpowers/specs/2026-05-06-cashshift-order-number-design.md`.
