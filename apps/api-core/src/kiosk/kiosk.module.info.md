
### Kiosk (kiosk)

### Respuesta serializada

**KioskStatusDto** — usado en GET /:slug/status:

```json
{
  "registerOpen": true
}
```

**KioskMenuDto[]** — usado en GET /:slug/menus:

```json
[
  {
    "id": "string",
    "name": "string",
    "active": true,
    "startTime": "09:00 | null",
    "endTime": "22:00 | null",
    "daysOfWeek": "MON,TUE,WED | null"
  }
]
```

**KioskMenuItemsResponseDto** — usado en GET /:slug/menus/:menuId/items:

```json
{
  "menuId": "string",
  "menuName": "string",
  "sections": {
    "Bebidas": [
      {
        "id": "string",
        "name": "string",
        "description": "string | null",
        "price": 3.5,
        "imageUrl": "string | null",
        "stockStatus": "IN_STOCK | OUT_OF_STOCK | LOW_STOCK"
      }
    ]
  }
}
```

**Respuesta de creación de orden** — usado en POST /:slug/orders:

```json
{
  "order": {
    "id": "string",
    "orderNumber": 1,
    "status": "CREATED",
    "paymentMethod": "CASH | CARD | null",
    "customerEmail": "string | null",
    "totalAmount": 12.5,
    "isPaid": false,
    "cancellationReason": null,
    "restaurantId": "string",
    "cashShiftId": "string",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601",
    "items": [ /* OrderItemDto[] */ ]
  },
  "receipt": "string | null",
  "kitchenTicket": "string | null"
}
```

**KioskOrderStatusDto** — usado en GET /:slug/orders/:orderId:

```json
{
  "id": "string",
  "orderNumber": 1,
  "status": "CREATED | PROCESSING | COMPLETED | CANCELLED",
  "totalAmount": 12.5,
  "items": [
    {
      "id": "string",
      "productId": "string",
      "menuItemId": "string | null",
      "quantity": 2,
      "unitPrice": 6.25,
      "subtotal": 12.5,
      "notes": "string | null"
    }
  ],
  "createdAt": "ISO8601"
}
```

### Endpoints

Todos los endpoints son **PÚBLICOS — no requieren JWT** (no aplica `JwtAuthGuard`).

| Método | Ruta | Auth | Respuesta | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/kiosk/:slug/status` | Público | `KioskStatusDto` | Estado del kiosk (caja abierta) |
| `GET` | `/v1/kiosk/:slug/menus` | Público | `KioskMenuDto[]` | Menús disponibles en el horario actual |
| `GET` | `/v1/kiosk/:slug/menus/:menuId/items` | Público | `KioskMenuItemsResponseDto` | Items de un menú agrupados por sección |
| `POST` | `/v1/kiosk/:slug/orders` | Público | `{ order, receipt, kitchenTicket }` (201) | Crear orden desde el kiosk |
| `GET` | `/v1/kiosk/:slug/orders/:orderId` | Público | `KioskOrderStatusDto` | Consultar estado de una orden |

---

#### Status — `GET /v1/kiosk/:slug/status`

E2E: ✅ `test/kiosk/kioskStatus.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Restaurante existe, caja abierta | 200 | `{ registerOpen: true }` |
| Restaurante existe, caja cerrada | 200 | `{ registerOpen: false }` |
| Slug no existe | 404 | `ENTITY_NOT_FOUND` |
| No requiere token | 200 | Endpoint público |

---

#### Menus — `GET /v1/kiosk/:slug/menus`

E2E: ✅ `test/kiosk/kioskMenus.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Restaurante con menús activos | 200 | Retorna array de `KioskMenuDto` disponibles en el horario actual |
| Restaurante sin menús activos | 200 | Retorna array vacío `[]` |
| Slug no existe | 404 | `ENTITY_NOT_FOUND` |
| No requiere token | 200 | Endpoint público |
| Menús filtrados por horario y día | 200 | Solo menús activos y disponibles en el momento de la consulta |

---

#### Menu Items — `GET /v1/kiosk/:slug/menus/:menuId/items`

E2E: ✅ `test/kiosk/kioskMenuItems.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Menú válido con items | 200 | Retorna `KioskMenuItemsResponseDto` con secciones agrupadas |
| Items agrupados por categoría | 200 | `sections` es un objeto por nombre de categoría |
| Slug no existe | 404 | `ENTITY_NOT_FOUND` |
| `menuId` no existe | 404 | `ENTITY_NOT_FOUND` |
| No requiere token | 200 | Endpoint público |
| `price` como number | 200 | BigInt serializado a number |
| `stockStatus` refleja disponibilidad | 200 | Derivado del stock del producto |

---

#### Create Order — `POST /v1/kiosk/:slug/orders`

E2E: ✅ `test/kiosk/kioskCreateOrder.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Orden válida con caja abierta | 201 | Retorna `{ order, receipt, kitchenTicket }` |
| No requiere token | 201 | Endpoint público |
| Slug no existe | 404 | `ENTITY_NOT_FOUND` |
| No hay caja registradora abierta | 409 | `NO_OPEN_CASH_REGISTER` |
| Producto sin stock suficiente | 400 | `STOCK_INSUFFICIENT` |
| `expectedTotal` no coincide con precios reales | 400 | Protección ante cambio de precios |
| `items` vacío | 400 | Validación DTO |
| `totalAmount` como number en respuesta | 201 | BigInt serializado a number |
| Emite evento WebSocket `order:created` | — | Notificación en tiempo real al dashboard |
| `orderNumber` es secuencial dentro de la sesión de caja | 201 | Incrementado atómicamente en `$transaction` |

---

#### Order Status — `GET /v1/kiosk/:slug/orders/:orderId`

E2E: ✅ `test/kiosk/kioskOrderStatus.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Orden existente | 200 | Retorna `KioskOrderStatusDto` |
| No requiere token | 200 | Endpoint público |
| `orderId` no existe | 404 | `ENTITY_NOT_FOUND` |
| Slug no existe | 404 | `ENTITY_NOT_FOUND` |
| `totalAmount` como number | 200 | BigInt serializado a number |
| Estado actualizado reflejado | 200 | Permite polling del estado desde el kiosk |

---

### Notas de implementación

- Todos los endpoints usan el decorator implícito de no-auth — el controller no aplica `JwtAuthGuard` ni `RolesGuard`. En proyectos con guard global se usaría `@Public()`, pero aquí el controller no registra ningún guard
- `getStatus` devuelve `{ registerOpen: boolean }` — verifica si existe alguna sesión `OPEN` en el restaurante (no filtra por usuario)
- `getAvailableMenus` filtra menús por `active = true` y valida el horario (`startTime`/`endTime`) y día de la semana (`daysOfWeek`) en el momento de la consulta
- La creación de órdenes (`createKioskOrder`) delega en `OrdersService.createOrder` que usa `$transaction` para: validar stock, decrementar stock atómicamente, incrementar `lastOrderNumber` en la sesión de caja y persistir la orden
- BigInt: `totalAmount`, `unitPrice` y `subtotal` se almacenan como `BigInt` en PostgreSQL. El repositorio los serializa a `number` antes de devolver la respuesta JSON
- `receipt` y `kitchenTicket` en la respuesta de creación son strings HTML/texto generados por `PrintService`; pueden ser `null` si el servicio de impresión falla (fire-and-forget — nunca bloquea la respuesta)
- El endpoint `GET /:slug/orders/:orderId` no valida que la orden pertenezca al restaurante del slug más allá de resolver el restaurante — es intencional para simplificar el polling desde el kiosk
