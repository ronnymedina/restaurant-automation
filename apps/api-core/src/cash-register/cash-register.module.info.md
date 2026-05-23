
### Cash Register (cash-register)

### Reglas de negocio

- Solo puede existir una sesión `OPEN` por restaurante a la vez. Cualquier ADMIN o MANAGER puede abrir o cerrar la sesión activa, sin importar quién la abrió.
- **No se puede cerrar la caja con pedidos en `CREATED` o `PROCESSING`** — el endpoint lanza `PENDING_ORDERS_ON_SHIFT` (409) indicando cuántos pedidos quedan pendientes.
- Al cerrar, solo existen pedidos `COMPLETED` o `CANCELLED` en la sesión:
  - `COMPLETED` = pedido entregado, dinero en caja. Cuenta en el total.
  - `CANCELLED` = devolución realizada. El dinero regresó al cliente. **No cuenta en el total**; el historial conserva el registro como evidencia.
- **Pedido pagado no recogido por el cliente → debe marcarse `COMPLETED`, no cancelarse.** El restaurante cobró y preparó el pedido; el dinero queda en caja. Esta distinción se refuerza con confirmaciones claras en la UI de cocina.
- El `restaurantId` viene del JWT — toda operación está aislada por restaurante.
- `paymentBreakdown` siempre refleja solo órdenes `COMPLETED`.

---

### Respuestas serializadas

**`CashShiftDto`** — usado en `POST /open`, `GET /current`, `GET /history`, `GET /summary/:sessionId`:

```json
{
  "id": "string",
  "status": "OPEN | CLOSED",
  "displayOpenedAt": "7 may 2026, 22:44",
  "displayClosedAt": "7 may 2026, 23:30 | null",
  "closedBy": "string | null",
  "openedByEmail": "string | null",
  "_count": { "orders": 12 }
}
```

- `displayOpenedAt` / `displayClosedAt` están formateadas en el timezone del restaurante (transformación en el backend vía `TimezoneService`). Formato: `d MMM yyyy, HH:mm` en locale `es`.
- `_count` solo está presente en `GET /current` e `GET /history`.
- Campos **eliminados del response**: `restaurantId`, `userId`, `lastOrderNumber`, `openingBalance`, `totalSales`, `totalOrders`, `openedAt` (UTC), `closedAt` (UTC).

---

**`CloseSessionResponseDto`** — usado en `POST /close`:

```json
{
  "session": { "...": "CashShiftDto" },
  "summary": {
    "totalOrders": 2,
    "totalSales": 20.0,
    "paymentBreakdown": [
      { "method": "CASH", "count": 1, "total": 10.0 },
      { "method": "CARD", "count": 1, "total": 10.0 }
    ]
  }
}
```

- `summary.totalOrders` y `summary.totalSales` reflejan solo órdenes `COMPLETED`.
- `paymentBreakdown` es un array de `{ method, count, total }`.

---

**`SessionSummaryResponseDto`** — usado en `GET /summary/:sessionId`:

```json
{
  "session": { "...": "CashShiftDto" },
  "summary": {
    "completed": { "count": 2, "total": 20.0 },
    "cancelled": { "count": 1 },
    "paymentBreakdown": [
      { "method": "CASH", "count": 1, "total": 10.0 },
      { "method": "CARD", "count": 1, "total": 10.0 }
    ]
  }
}
```

- `completed`: pedidos entregados y cobrados. `total` es el ingreso real de la sesión.
- `cancelled`: pedidos devueltos. Solo se expone `count`; no hay `total` porque el dinero fue reintegrado al cliente.
- `paymentBreakdown`: desglose por método de pago, solo de `COMPLETED`.
- `CREATED` y `PROCESSING` no aparecen — son estructuralmente imposibles en una sesión cerrada.

---

**`TopProductsResponseDto`** — usado en `GET /top-products/:sessionId`:

```json
{
  "topProducts": [
    { "id": "string", "name": "Burger", "quantity": 15, "total": 75.0 }
  ]
}
```

---

**`CashShiftStatsDto`** — usado en `GET /stats` y `POST /close` (reemplaza `summary` anterior):

```json
{
  "counts": {
    "total": 12,
    "created": 1,
    "confirmed": 2,
    "processing": 1,
    "served": 1,
    "completed": 6,
    "cancelled": 1,
    "pending": 5
  },
  "revenue": {
    "completed": 120.50,
    "pending": 45.00,
    "averageTicket": 20.08
  },
  "byPaymentMethod": [
    { "method": "CASH", "count": 3, "total": 60.00 },
    { "method": "CARD", "count": 3, "total": 60.50 }
  ],
  "byOrderType": [
    { "type": "PICKUP", "count": 8 },
    { "type": "DELIVERY", "count": 4 }
  ],
  "byOrderSource": [
    { "source": "STAFF", "count": 7 },
    { "source": "KIOSK", "count": 5 }
  ],
  "topProducts": [
    { "id": "uuid", "name": "Burger Clásica", "quantity": 15, "total": 75.00 }
  ]
}
```

- `counts.pending` = total − completed − cancelled
- `revenue.completed` = sum(totalAmount) donde status = COMPLETED
- `revenue.pending` = sum(totalAmount) donde status NOT IN [COMPLETED, CANCELLED]
- `revenue.averageTicket` = completed.revenue / counts.completed; 0 si counts.completed = 0
- `byPaymentMethod` = solo órdenes COMPLETED (dinero real en caja)
- `byOrderType` = todas las órdenes (incluso CANCELLED — refleja intención original del pedido)
- `topProducts` = top 5 por quantity; excluye items de órdenes CANCELLED; máx 5 elementos

---

**Historial paginado** — usado en `GET /history`:

```json
{
  "data": [ /* CashShiftDto[] */ ],
  "meta": {
    "total": 30,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

---

### Endpoints

| Método | Ruta | Roles | Respuesta | Descripción |
|--------|------|-------|-----------|-------------|
| `POST` | `/v1/cash-register/open` | ADMIN, MANAGER | `CashShiftDto` (201) | Abrir sesión de caja |
| `POST` | `/v1/cash-register/close` | ADMIN, MANAGER | `{ session, stats }` (200) | Cerrar sesión activa |
| `GET` | `/v1/cash-register/stats` | ADMIN, MANAGER, BASIC | `CashShiftStatsDto` | Stats en vivo de la sesión activa |
| `GET` | `/v1/cash-register/current` | ADMIN, MANAGER, BASIC | `CashShiftDto` o `{}` | Sesión actualmente abierta |
| `GET` | `/v1/cash-register/history` | ADMIN, MANAGER | `{ data: CashShiftDto[], meta }` | Historial paginado |
| `GET` | `/v1/cash-register/summary/:sessionId` | ADMIN, MANAGER | `SessionSummaryResponseDto` | Resumen detallado de sesión (delegado a StatsService) |
| `GET` | `/v1/cash-register/top-products/:sessionId` | ADMIN, MANAGER | `TopProductsResponseDto` | Top 5 productos de la sesión (delegado a StatsService) |

---

#### Open — `POST /v1/cash-register/open`

E2E: ✅ `test/cash-register/openCashRegister.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC intenta abrir | 403 | Solo ADMIN o MANAGER |
| ADMIN abre sesión | 201 | Retorna `CashShiftDto` con `status = OPEN` |
| MANAGER abre sesión | 201 | Retorna `CashShiftDto` con `status = OPEN` |
| Ya existe sesión abierta | 409 | `REGISTER_ALREADY_OPEN` |

---

#### Close — `POST /v1/cash-register/close`

E2E: ✅ `test/cash-register/closeSession.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC intenta cerrar | 403 | Solo ADMIN o MANAGER |
| ADMIN cierra sesión | 200 | Retorna `CloseSessionResponseDto` |
| MANAGER cierra sesión | 200 | Retorna `CloseSessionResponseDto` |
| No hay sesión abierta | 409 | `NO_OPEN_REGISTER` |
| Hay pedidos en `CREATED` o `PROCESSING` | 409 | `PENDING_ORDERS_ON_SHIFT` — `details.pendingCount` indica cuántos quedan |
| `summary.totalSales` solo refleja `COMPLETED` | 200 | `CANCELLED` excluidas del total |
| `paymentBreakdown` como array | 200 | `[{ method, count, total }]` |

---

#### Current — `GET /v1/cash-register/current`

E2E: ✅ `test/cash-register/currentCashRegister.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| Con sesión abierta | 200 | Retorna `CashShiftDto` con `status = OPEN` |
| Sin sesión abierta | 200 | Retorna `{}` (objeto vacío) |
| Incluye conteo de órdenes | 200 | `_count.orders` incluido |

---

#### History — `GET /v1/cash-register/history`

E2E: ✅ `test/cash-register/cashRegisterHistory.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| ADMIN consulta historial | 200 | Retorna `{ data, meta }` paginado |
| Con `?page=1&limit=5` | 200 | `meta.limit = 5`, paginación correcta |
| Solo sesiones del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |
| Fechas en timezone del restaurante | 200 | `displayOpenedAt` / `displayClosedAt` formateadas en backend |

---

#### Stats — `GET /v1/cash-register/stats`

E2E: `test/cash-register/cashRegisterStats.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC puede ver stats | 200 | Acceso abierto a todos los roles |
| MANAGER puede ver stats | 200 | |
| ADMIN puede ver stats | 200 | |
| Sin caja abierta | 200 | Retorna estructura con todos los valores en 0, no error |
| Con sesión activa y órdenes mixtas | 200 | Counts correctos por status |
| `counts.pending` correcto | 200 | Excluye COMPLETED y CANCELLED |
| `revenue.completed` correcto | 200 | Suma solo órdenes COMPLETED |
| `revenue.pending` correcto | 200 | Suma excluye COMPLETED y CANCELLED |
| `revenue.averageTicket` con 0 completados | 200 | Retorna 0, sin dividir por cero |
| `byPaymentMethod` solo COMPLETED | 200 | Método de pago de canceladas no aparece |
| Top 5 productos, ordenados por quantity | 200 | CANCELLED excluidas |
| Stats consistentes con resumen de cierre | 200 | Stats activos == stats del `POST /close` |
| Aislamiento por restaurante | 200 | `restaurantId` del JWT — no ve stats de otro restaurante |

---

#### Summary — `GET /v1/cash-register/summary/:sessionId`

E2E: ✅ `test/cash-register/cashRegisterSummary.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| Sesión cerrada | 200 | Retorna `SessionSummaryResponseDto` |
| `summary.completed` refleja solo `COMPLETED` | 200 | `count` y `total` de pedidos entregados |
| `summary.cancelled` solo tiene `count` | 200 | Sin `total` — dinero fue devuelto al cliente |
| `paymentBreakdown` como array | 200 | Solo de `COMPLETED`, `[{ method, count, total }]` |
| Sesión no encontrada | 404 | `REGISTER_NOT_FOUND` |

---

#### Top-products — `GET /v1/cash-register/top-products/:sessionId`

E2E: ✅ `test/cash-register/topProducts.e2e-spec.ts`

| Caso | Status | Detalle |
|------|--------|---------|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| Sesión válida | 200 | `topProducts` array, máx 5 elementos |
| Órdenes `CANCELLED` excluidas | 200 | Solo items de órdenes no canceladas |
| Sesión no encontrada | 404 | `REGISTER_NOT_FOUND` |

---

### Notas de implementación

- Solo puede existir una sesión `OPEN` por restaurante. Reforzado con partial index en PostgreSQL: `CREATE UNIQUE INDEX "one_open_shift_per_restaurant" ON "CashShift"("restaurantId") WHERE status = 'OPEN';` (debe crearse manualmente al hacer deploy — Prisma no lo gestiona automáticamente).
- El cierre de sesión es atómico via `$transaction` de Prisma: verifica pedidos pendientes, actualiza la sesión. Las stats se calculan fuera de la transacción via `CashRegisterStatsService.getStats()`.
- `totalSales` se almacena como `BigInt` en la BD (centavos). Se convierte con `fromCents()` antes de enviar al cliente.
- `GET /current` retorna `{}` cuando no hay sesión abierta — no lanza 404.
- `GET /stats` retorna estructura con zeros cuando no hay sesión abierta — no lanza error.
- `displayOpenedAt` / `displayClosedAt` se calculan en el constructor de `CashShiftSerializer` usando `Intl.DateTimeFormat` con el timezone del restaurante, obtenido via `TimezoneService` (con caché en Redis/memory).
- **`CashRegisterStatsService`** centraliza toda la lógica de agregación de métricas. Usa 2 queries en paralelo: (1) `Order.groupBy(['status','paymentMethod','orderType','orderSource'])` para todos los counts y totales; (2) `OrderItem.groupBy(['productId'])` para top products. `getSessionSummary` y `getTopProducts` de `CashRegisterService` se eliminan y se delegan a este servicio.
- `OrderItem` requiere `@@index([orderId])` — sin este índice el join para top products hace seq scan. Se agrega en la misma migración de este feature. Ver spec: `docs/superpowers/specs/2026-05-21-cash-register-stats-design.md`.

---

### `lastOrderNumber` — contador de órdenes por turno

`CashShift.lastOrderNumber` es un contador que se incrementa con cada orden creada. Su valor se asigna como `orderNumber` en la orden. El constraint `@@unique([cashShiftId, orderNumber])` garantiza unicidad por turno. Es solo un número de display para el ticket físico — no se expone en el `CashShiftDto` de respuesta.

**Gaps:** La secuencia puede tener huecos si una orden falla después del increment. Aceptable dado el uso únicamente visual.

#### Contención bajo carga concurrente (ERR-05)

Bajo alta concurrencia, el `UPDATE CashShift.lastOrderNumber` genera contención. **Solución implementada (Opción A):** el increment se extrae a una transacción corta independiente, liberando el lock en ~2ms.

| Opción | Descripción | Estado |
|--------|-------------|--------|
| **A — Dos transacciones** | Tx1 corta solo para increment; Tx2 para stock + INSERT | ✅ Elegida |
| **B — PostgreSQL SEQUENCE** | `nextval()` fuera de cualquier tx; contención prácticamente cero | Reservada para alta escala |
| **C — Redis INCR** | Contador atómico externo | Descartada |

Ver spec completo en `docs/superpowers/specs/2026-05-06-cashshift-order-number-design.md`.
