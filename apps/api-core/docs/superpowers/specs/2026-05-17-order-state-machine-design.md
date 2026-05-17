# Design: Máquina de estados de pedidos — estado SERVED y validaciones estrictas

**Fecha:** 2026-05-17
**Estado:** Aprobado
**Relacionado con:** `apps/api-core/src/orders/`, `apps/api-core/src/kitchen/`

---

## Problema

Dos inconsistencias en el flujo de estados de pedidos:

1. **Cocina puede completar pedidos sin pago.** `kitchenAdvanceStatus` avanza PROCESSING → COMPLETED sin validar `isPaid`. Una vez en COMPLETED, el pedido desaparece del panel activo del dashboard aunque no esté cobrado. El cajero solo lo puede encontrar buscando en el historial.

2. **El dashboard permite saltar estados.** `updateOrderStatus` valida `targetIdx > currentIdx`, lo que permite transiciones como CREATED → COMPLETED directamente. La cocina ya tiene validación estricta (+1 paso), el dashboard no.

---

## Diseño

### Máquina de estados

```
CREATED → CONFIRMED → PROCESSING → SERVED → COMPLETED
    ↘          ↘            ↘          ↘
                          CANCELLED (solo Dashboard)
```

**Fuentes de creación de CREATED:**
- Kiosco (totem físico)
- STAFF (desde el dashboard)
- WEB (pedido desde la web)

**Estados terminales:** `COMPLETED`, `CANCELLED`

### Invariantes del sistema

- `COMPLETED` siempre implica `isPaid = true` — sin excepción.
- La cocina nunca puede mover un pedido a `COMPLETED`.
- Toda transición es estrictamente +1 paso (sin saltos de estado) — tanto cocina como dashboard.
- No se puede cancelar un pedido con `isPaid = true` (se debe hacer `UNPAY` antes).
- `COMPLETED` no puede cancelarse.
- `CANCELLED` es estado terminal — no puede avanzar.
- Retroceder estado siempre lanza `InvalidStatusTransitionException`.

---

## Responsabilidades por actor

### Cocina (`PATCH /v1/kitchen/:slug/orders/:id/status`)

| Transición permitida | Condición |
|---|---|
| CONFIRMED → PROCESSING | Sin restricciones |
| PROCESSING → SERVED | Sin restricciones — pago lo gestiona el cajero |

- Solo puede avanzar exactamente +1 paso (`targetIdx === currentIdx + 1`).
- Tope máximo: `SERVED`. Intentar avanzar a `COMPLETED` lanza `InvalidStatusTransitionException`.
- No puede cancelar pedidos.
- No verifica `isPaid`.

### Dashboard / Cajero (`PATCH /v1/orders/:id/status`)

| Transición permitida | Condición |
|---|---|
| CONFIRMED → PROCESSING | Sin restricciones |
| PROCESSING → SERVED | Sin restricciones |
| SERVED → COMPLETED | Requiere `isPaid = true` |

- Solo puede avanzar exactamente +1 paso (`targetIdx === currentIdx + 1`). **Fix requerido** — actualmente permite saltos.
- Puede alcanzar `COMPLETED` si `isPaid = true`.
- Puede cancelar desde cualquier estado pre-COMPLETED (ver sección de cancelaciones).

### Endpoint de pago (`PATCH /v1/orders/:id/pay`)

- Acción especial — no sigue la máquina de estados lineal.
- Si el pedido está en `SERVED` al momento de pagar: avanza automáticamente a `COMPLETED` en la misma operación.
- Si el pedido está en cualquier otro estado: solo marca `isPaid = true` sin cambiar el estado.
- Si estaba en `CREATED`: avanza automáticamente a `CONFIRMED` (comportamiento existente).

### Endpoint de confirmación (`PATCH /v1/orders/:id/confirm`)

- Solo aplica CREATED → CONFIRMED.
- Ya existe y ya valida la transición. Sin cambios.

---

## Cancelaciones

Solo el dashboard puede cancelar. Aplica desde cualquier estado pre-COMPLETED: `CREATED`, `CONFIRMED`, `PROCESSING`, `SERVED`.

### Regla de pago para cancelar

Si el pedido tiene `isPaid = true`, el sistema rechaza la cancelación con `CannotCancelPaidOrderException` (ya implementado en el backend). El cajero debe primero hacer la devolución manual y luego llamar `PATCH /v1/orders/:id/unpay` para quitar el pago. Solo entonces puede cancelar.

**Flujo de cancelación con devolución:**

```
Pedido (isPaid=true)
  → PATCH /v1/orders/:id/unpay   (devolución manual realizada)
  → isPaid = false
  → PATCH /v1/orders/:id/cancel
  → CANCELLED
```

**Flujo de cancelación sin devolución:**

```
Pedido (isPaid=false)
  → PATCH /v1/orders/:id/cancel
  → CANCELLED
```

---

## Principio de diseño — separación de responsabilidades

Cada función pública de `orders.service.ts` debe orquestar, no implementar. La lógica de validación, verificación de pago y aplicación de transiciones va en métodos privados pequeños con una sola responsabilidad.

### Helpers privados propuestos para `orders.service.ts`

```ts
// Valida que la transición sea exactamente +1 paso en STATUS_ORDER.
// Lanza InvalidStatusTransitionException si no lo es.
private assertSequentialTransition(current: OrderStatus, next: OrderStatus): void

// Valida que el estado destino no supere el tope máximo permitido para cocina (SERVED).
// Lanza InvalidStatusTransitionException si lo supera.
private assertKitchenMaxStatus(targetStatus: OrderStatus): void

// Valida que el pedido esté pagado cuando el destino es COMPLETED.
// Lanza OrderNotPaidException si no lo está.
private assertPaidIfCompleting(order: Order, targetStatus: OrderStatus): void

// Valida que el pedido no esté pagado antes de cancelar.
// Lanza CannotCancelPaidOrderException si lo está.
private assertNotPaidForCancel(order: Order): void

// Aplica el cambio de estado en el repositorio y emite el evento SSE.
private async applyStatusChange(orderId: string, restaurantId: string, status: OrderStatus): Promise<Order>
```

### Cómo quedan las funciones públicas tras la refactorización

```ts
async updateOrderStatus(id, restaurantId, newStatus) {
  const order = await this.findById(id, restaurantId);
  this.assertNotCancelled(order);
  this.assertSequentialTransition(order.status, newStatus);
  this.assertPaidIfCompleting(order, newStatus);
  return this.applyStatusChange(id, restaurantId, newStatus);
}

async kitchenAdvanceStatus(id, restaurantId, newStatus) {
  const order = await this.findById(id, restaurantId);
  this.assertNotCancelled(order);
  this.assertSequentialTransition(order.status, newStatus);
  this.assertKitchenMaxStatus(newStatus);
  return this.applyStatusChange(id, restaurantId, newStatus);
}

async cancelOrder(id, restaurantId, reason) {
  const order = await this.findById(id, restaurantId);
  this.assertNotCancelled(order);
  this.assertNotCompleted(order);
  this.assertNotPaidForCancel(order);
  // ... persist + emit
}
```

Cada helper lanza su propia excepción tipada — las funciones públicas no tienen lógica de validación inline.

---

## Cambios requeridos

### Backend — `apps/api-core/`

#### 1. Prisma schema (`prisma/schema.postgresql.prisma`)
Agregar `SERVED` entre `PROCESSING` y `COMPLETED` en el enum `OrderStatus`.

```prisma
enum OrderStatus {
  CREATED
  CONFIRMED
  PROCESSING
  SERVED      // nuevo
  COMPLETED
  CANCELLED
}
```

#### 2. Migración de base de datos
```sql
ALTER TYPE "OrderStatus" ADD VALUE 'SERVED';
```
Mismo patrón que la migración `20260516151252_add_confirmed_state_order_source_type`.

#### 3. `orders.service.ts`

**`STATUS_ORDER`** — agregar `SERVED`:
```ts
const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SERVED,     // nuevo
  OrderStatus.COMPLETED,
];
```

**`updateOrderStatus`** — cambiar de "cualquier avance" a estrictamente +1:
```ts
// antes:
if (targetIdx <= currentIdx || targetIdx === -1) { ... }

// después:
if (targetIdx === -1 || targetIdx !== currentIdx + 1) { ... }
```

**`kitchenAdvanceStatus`** — agregar tope en `SERVED`:
```ts
const KITCHEN_MAX_IDX = STATUS_ORDER.indexOf(OrderStatus.SERVED);
if (targetIdx === -1 || targetIdx !== currentIdx + 1 || targetIdx > KITCHEN_MAX_IDX) {
  throw new InvalidStatusTransitionException(order.status, newStatus);
}
```

**`markAsPaid`** — avanzar automáticamente a `COMPLETED` si el pedido está en `SERVED`:
```ts
if (order.status === OrderStatus.SERVED) {
  await this.orderRepository.updateStatus(id, OrderStatus.COMPLETED);
}
```

#### 4. `kitchen.service.ts`
`getActiveOrders` ya filtra `[CONFIRMED, PROCESSING]`. Sin cambios — `SERVED` no se muestra en el KDS (la cocina ya entregó el pedido).

### Frontend — `apps/ui/`

#### Kitchen (`/kitchen`)
- El botón de avance desde `PROCESSING` ahora envía `SERVED` al API.
- `SERVED` no aparece en la cola del KDS.

#### Dashboard (`/dash/orders`)
- Agregar `SERVED` al kanban, panel de filtros, y lista filtrada.
- Los pedidos `SERVED` son visibles para el cajero como "entregado, pendiente de cobro".
- Al presionar "cobrar" en un pedido `SERVED`: `PATCH /orders/:id/pay` → el backend avanza a `COMPLETED` automáticamente.

#### Historial (`/dash/orders-history`)
- Agregar `SERVED` como opción de filtro de estado.

### Documentación — `.module.info.md`

- `orders.module.info.md` — actualizar tabla de transiciones, casos E2E, y descripción de la máquina de estados.
- `kitchen.module.info.md` — actualizar flujo de estados activos y transiciones permitidas.

---

## Tests a agregar / actualizar

| Archivo | Caso nuevo |
|---|---|
| `orders.service.spec.ts` | `kitchenAdvanceStatus` lanza error al intentar SERVED → COMPLETED |
| `orders.service.spec.ts` | `updateOrderStatus` lanza error al intentar saltar más de un paso |
| `orders.service.spec.ts` | `markAsPaid` en SERVED avanza automáticamente a COMPLETED |
| `kitchen.service.spec.ts` | Cocina avanza hasta SERVED; no puede avanzar más |
| `test/orders/updateOrderStatus.e2e-spec.ts` | PROCESSING → SERVED permitido; SERVED → COMPLETED con isPaid; SERVED → COMPLETED sin isPaid lanza error |
| `test/orders/markOrderAsPaid.e2e-spec.ts` | Pagar en SERVED = COMPLETED automático |
| `test/kitchen/advanceStatus.e2e-spec.ts` | PROCESSING → SERVED permitido; SERVED → COMPLETED rechazado desde cocina |

---

## Resumen de cambios por archivo

| Archivo | Tipo de cambio |
|---|---|
| `prisma/schema.postgresql.prisma` | Agregar `SERVED` al enum |
| `prisma/migrations/YYYYMMDD_add_served_state/migration.sql` | `ALTER TYPE "OrderStatus" ADD VALUE 'SERVED'` |
| `src/orders/orders.service.ts` | `STATUS_ORDER`, `updateOrderStatus`, `kitchenAdvanceStatus`, `markAsPaid` |
| `src/orders/orders.module.info.md` | Actualizar documentación |
| `src/kitchen/kitchen.module.info.md` | Actualizar documentación |
| `src/orders/orders.service.spec.ts` | Nuevos casos de prueba |
| `src/kitchen/kitchen.service.spec.ts` | Nuevos casos de prueba |
| `test/orders/updateOrderStatus.e2e-spec.ts` | Nuevos casos E2E |
| `test/orders/markOrderAsPaid.e2e-spec.ts` | Nuevos casos E2E |
| `apps/ui/src/pages/kitchen/index.astro` | Avanzar a SERVED en lugar de COMPLETED |
| `apps/ui/src/pages/dash/orders.astro` | Agregar SERVED al kanban y filtros |
| `apps/ui/src/pages/dash/orders-history.astro` | Agregar SERVED al filtro de historial |
