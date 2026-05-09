
### Cash Register (cash-register)

### Respuesta serializada

**CashShiftDto** — usado en POST /open, GET /current, GET /history:

```json
{
  "id": "string",
  "restaurantId": "string",
  "userId": "string",
  "user": { "id": "string", "email": "string" },
  "status": "OPEN | CLOSED",
  "lastOrderNumber": 0,
  "openingBalance": 0.0,
  "openedAt": "ISO8601",
  "closedAt": "ISO8601 | null",
  "totalSales": 150.0,
  "totalOrders": 12,
  "closedBy": "string | null",
  "_count": { "orders": 12 }
}
```

Note: `_count` is only present in responses from `GET /current` and `GET /history`.

**CloseSessionResponseDto** — usado en POST /close:

```json
{
  "session": {
    "id": "string",
    "restaurantId": "string",
    "status": "CLOSED",
    "openedAt": "ISO8601",
    "closedAt": "ISO8601",
    "totalSales": 150.0,
    "totalOrders": 12,
    "closedBy": "string"
  },
  "summary": {
    "totalOrders": 12,
    "totalSales": 150.0,
    "paymentBreakdown": {
      "CASH": { "count": 8, "total": 100.0 },
      "CARD": { "count": 4, "total": 50.0 }
    }
  }
}
```

**SessionSummaryResponseDto** — usado en GET /summary/:sessionId:

```json
{
  "session": { /* CashShiftDto */ },
  "summary": {
    "totalOrders": 12,
    "totalSales": 150.0,
    "completedOrders": 10,
    "cancelledOrders": 2,
    "paymentBreakdown": {
      "CASH": { "count": 8, "total": 100.0 }
    },
    "topProducts": [
      { "id": "string", "name": "string", "quantity": 15, "total": 75.0 }
    ]
  },
  "orders": [ /* Order[] */ ]
}
```

**Historial paginado** — usado en GET /history:

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

### Endpoints

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `POST` | `/v1/cash-register/open` | ADMIN, MANAGER | `CashShiftDto` (201) | Abrir sesión de caja |
| `POST` | `/v1/cash-register/close` | ADMIN, MANAGER | `CloseSessionResponseDto` (200) | Cerrar sesión de caja activa |
| `GET` | `/v1/cash-register/current` | ADMIN, MANAGER | `CashShiftDto` o `{}` | Sesión actualmente abierta |
| `GET` | `/v1/cash-register/history` | ADMIN, MANAGER | `{ data: CashShiftDto[], meta }` | Historial paginado de sesiones |
| `GET` | `/v1/cash-register/summary/:sessionId` | ADMIN, MANAGER | `SessionSummaryResponseDto` | Resumen detallado de una sesión |

---

#### Open — `POST /v1/cash-register/open`

E2E: ✅ `test/cash-register/openCashRegister.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta abrir | 403 | Solo ADMIN o MANAGER |
| ADMIN abre sesión | 201 | Retorna `CashShiftDto` con `status = OPEN` |
| MANAGER abre sesión | 201 | Retorna `CashShiftDto` con `status = OPEN` |
| Ya existe una sesión abierta para el restaurante | 409 | `REGISTER_ALREADY_OPEN` |
| Segunda sesión bloqueada | 409 | Solo una sesión global activa por restaurante |

---

#### Close — `POST /v1/cash-register/close`

E2E: ✅ `test/cash-register/closeSession.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta cerrar | 403 | Solo ADMIN o MANAGER |
| ADMIN cierra sesión abierta | 200 | Retorna `CloseSessionResponseDto` con resumen |
| MANAGER cierra sesión abierta | 200 | Retorna `CloseSessionResponseDto` con resumen |
| No hay sesión abierta | 409 | `NO_OPEN_REGISTER` |
| Hay pedidos en `CREATED` o `PROCESSING` | 409 | `PENDING_ORDERS_ON_SHIFT` — `details.pendingCount` indica cuántos quedan |
| `summary.totalSales` como number | 200 | BigInt serializado a number |
| `paymentBreakdown` refleja métodos usados | 200 | Agrupado por `paymentMethod` |

---

#### Current — `GET /v1/cash-register/current`

E2E: ✅ `test/cash-register/currentCashRegister.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| Con sesión abierta | 200 | Retorna `CashShiftDto` con `status = OPEN` |
| Sin sesión abierta | 200 | Retorna `{}` (objeto vacío) |
| Incluye conteo de órdenes | 200 | `_count.orders` incluido en la respuesta |

---

#### History — `GET /v1/cash-register/history`

E2E: ✅ `test/cash-register/cashRegisterHistory.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| ADMIN consulta historial | 200 | Retorna `{ data, meta }` paginado |
| MANAGER consulta historial | 200 | Retorna `{ data, meta }` paginado |
| Con `?page=1&limit=5` | 200 | `meta.limit = 5`, paginación correcta |
| Solo sesiones del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |

---

#### Summary — `GET /v1/cash-register/summary/:sessionId`

E2E: ✅ `test/cash-register/cashRegisterSummary.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta consultar | 403 | Solo ADMIN o MANAGER |
| ADMIN consulta resumen de sesión cerrada | 200 | Retorna `SessionSummaryResponseDto` |
| MANAGER consulta resumen de sesión cerrada | 200 | Retorna `SessionSummaryResponseDto` |
| `topProducts` agrupados por ventas | 200 | Máximo 10 productos, ordenados por cantidad |
| Órdenes CANCELLED excluidas de `topProducts` | 200 | Solo se agregan productos de órdenes no canceladas |
| `completedOrders` y `cancelledOrders` en summary | 200 | Contadores separados |
| Sesión no encontrada | 404 | `REGISTER_NOT_FOUND` |

---

### Notas de implementación

- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- Solo puede existir una sesión `OPEN` por restaurante a la vez (global). `openSession` llama a `findOpen(restaurantId)` — sin filtro de usuario — y lanza `REGISTER_ALREADY_OPEN` (409) si ya existe una sesión abierta, sin importar qué usuario la abrió. Cualquier ADMIN o MANAGER puede cerrarla.
- En PostgreSQL, la unicidad se refuerza con un partial index: `CREATE UNIQUE INDEX "one_open_shift_per_restaurant" ON "CashShift"("restaurantId") WHERE status = 'OPEN';` — debe crearse manualmente al hacer deploy (Prisma no lo gestiona automáticamente).
- `userId` y `user.email` se incluyen en las respuestas de `POST /open`, `GET /current` y `GET /summary/:sessionId`. La respuesta de `POST /close` no incluye `user` (omitido de la transacción de cierre).
- El endpoint `POST /close` usa `@HttpCode(HttpStatus.OK)` explícito — devuelve 200 aunque sea un `POST`
- El cierre de sesión (`closeSession`) es atómico via `$transaction` de Prisma: calcula totales, actualiza la sesión y retorna el resumen en una sola transacción
- `totalSales` se almacena como `BigInt` en la BD (centavos). El servicio lo convierte con `Number()` antes de devolver el resumen
- `GET /current` retorna `{}` (objeto vacío) cuando no hay sesión abierta — no lanza 404
- El resumen (`GET /summary/:sessionId`) agrega `topProducts` con `orderItem.groupBy` en la BD (eficiente para sesiones con muchas órdenes); excluye órdenes `CANCELLED`
- La apertura de sesión también inicializa `lastOrderNumber` en 0 para el conteo secuencial de órdenes

---

### `lastOrderNumber` — contador de órdenes por turno

`CashShift.lastOrderNumber` es un contador que se incrementa en 1 con cada orden creada. Su valor tras el increment se asigna como `orderNumber` en la orden. El constraint `@@unique([cashShiftId, orderNumber])` en `Order` garantiza unicidad por turno.

**Uso:** Es solo un número de display para el ticket físico. No se usa como métrica de negocio ni para calcular totales (los totales se calculan directamente desde la tabla `Order`).

**Gaps:** La secuencia puede tener huecos si una orden falla después de que el contador fue incrementado (ej. stock insuficiente detectado en el decremento atómico). Esto es aceptable dado el uso únicamente visual del número.

#### Contención bajo carga concurrente (ERR-05)

Bajo alta concurrencia, el `UPDATE CashShift.lastOrderNumber` dentro de la transacción de creación de órdenes genera un cuello de botella: todas las transacciones compiten por el lock de esta fila durante toda la duración de la transacción (~300–600ms). Esto serializa efectivamente todas las órdenes concurrentes.

**Solución implementada (Opción A):** El increment se extrae a una transacción corta e independiente antes de la transacción principal, liberando el lock en ~2ms.

**Opciones evaluadas:**

| Opción | Descripción | Estado |
|--------|-------------|--------|
| **A — Dos transacciones** | Tx1 corta solo para el increment; Tx2 principal para stock + INSERT | ✅ Elegida |
| **B — PostgreSQL SEQUENCE** | Una sequence por CashShift (`CREATE SEQUENCE cash_shift_seq_<id>`); `nextval()` fuera de cualquier tx; contención prácticamente cero | Reservada para alta escala |
| **C — Redis INCR** | Contador atómico externo | Descartada (dependencia innecesaria) |

La Opción B sería la solución más correcta a nivel de infraestructura si la carga escala a cientos de VUs concurrentes. Ver spec completo en `docs/superpowers/specs/2026-05-06-cashshift-order-number-design.md`.
