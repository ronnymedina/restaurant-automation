
### Orders (orders)

### Respuesta serializada

**OrderDto** — usado en PATCH /:id/status, PATCH /:id/pay, PATCH /:id/cancel:

```json
{
  "id": "string",
  "orderNumber": 1,
  "status": "CREATED | PROCESSING | COMPLETED | CANCELLED",
  "paymentMethod": "CASH | CARD | null",
  "customerEmail": "string | null",
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
  "status": "CREATED | PROCESSING | COMPLETED | CANCELLED",
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
| `PATCH` | `/v1/orders/:id/status` | ADMIN, MANAGER | `OrderDto` | Avanzar estado de la orden |
| `PATCH` | `/v1/orders/:id/pay` | ADMIN, MANAGER | `OrderDto` | Marcar orden como pagada |
| `PATCH` | `/v1/orders/:id/cancel` | ADMIN, MANAGER | `OrderDto` | Cancelar una orden |

---

#### List — `GET /v1/orders`

E2E: ✅ `test/orders/listOrders.e2e-spec.ts`

Query params:
- `status` (opcional) — filtra por estado (`CREATED`, `PROCESSING`, `COMPLETED`, `CANCELLED`)
- `limit` (opcional) — máximo de registros a retornar (default `15`, max `15`); útil para el KDS del dashboard

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede listar | 200 | Retorna array de `OrderDto` |
| MANAGER puede listar | 200 | Retorna array de `OrderDto` |
| BASIC puede listar | 200 | Retorna array de `OrderDto` |
| Con `?status=CREATED` | 200 | Filtra por estado |
| Con `?status=PROCESSING` | 200 | Filtra por estado |
| Con `?limit=15` | 200 | Retorna máximo 15 pedidos más recientes |
| Sin `?limit` | 200 | Retorna máximo 15 pedidos (default) |
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
| MANAGER avanza PROCESSING → COMPLETED (isPaid = true) | 200 | Requiere `isPaid = true` para COMPLETED |
| Avanzar PROCESSING → COMPLETED sin pagar | 400 | `ORDER_NOT_PAID` |
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

### Notas de implementación

- `GET /v1/orders` aplica un `limit` de 15 por defecto (máximo 15). Para reportes históricos completos usar `/history` que tiene paginación
- `displayTime` se formatea en el timezone del restaurante server-side. El campo `createdAt` se mantiene en ISO8601
- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `totalAmount`, `unitPrice` y `subtotal` se almacenan como `BigInt` en PostgreSQL (centavos). El serializer los convierte a `number` para la respuesta JSON. JSON no soporta `BigInt` nativo
- Máquina de estados de orden:
  - Flujo normal: `CREATED → PROCESSING → COMPLETED`
  - Cancelación: `CREATED` o `PROCESSING → CANCELLED`
  - `COMPLETED` no puede cancelarse
  - `CANCELLED` no puede avanzar
  - Retroceder el estado lanza `INVALID_STATUS_TRANSITION`
- Para avanzar a `COMPLETED` la orden debe tener `isPaid = true`, de lo contrario lanza `ORDER_NOT_PAID`
- El endpoint `PATCH /:id/pay` es independiente del flujo de estado — se puede marcar como pagada en cualquier estado
- La creación de órdenes la realiza el módulo `kiosk` vía `POST /v1/kiosk/:slug/orders` — el controller de `orders` no expone `POST`
- Al crear una orden (kiosk), se emite evento `order:created` por WebSocket; al actualizar estado se emite `order:updated`
- Al marcar como pagada, se dispara de forma asíncrona la impresión de recibo y el envío de email si `customerEmail` está presente
- El historial aplica `dateTo` con hora `23:59:59.999` para incluir el día completo
- La asignación de `orderNumber` usa una transacción corta separada antes de la transacción principal de creación de orden, para evitar contención en `CashShift.lastOrderNumber`. Ver `src/cash-register/cash-register.module.info.md` y `docs/superpowers/specs/2026-05-06-cashshift-order-number-design.md`.
