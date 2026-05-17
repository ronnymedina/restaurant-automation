# Orders — Estado CONFIRMED y Rediseño del Flujo de Órdenes

**Fecha:** 2026-05-15
**Módulos afectados:** `orders`, `kitchen`, `kiosk`, `cash-register`
**Tipo:** Rediseño estructural — máquina de estados + nuevos campos en modelo

---

## Contexto

El flujo actual de órdenes tiene huecos de negocio críticos:

1. La cocina ve pedidos que aún no han sido confirmados ni pagados — puede preparar órdenes que nadie va a retirar.
2. No existe distinción entre pedidos de diferentes orígenes (web, kiosk, staff) — todos se tratan igual.
3. La cocina puede cancelar pedidos, incluso los que ya están pagados — genera inconsistencias financieras.
4. No existe información sobre si un pedido es para retirar, delivery o consumo en mesa.

Este spec diseña el estado `CONFIRMED` y los campos de soporte necesarios para resolver estos problemas.

---

## Nueva Máquina de Estados

```
                    ┌─────────────┐
                    │   CREATED   │──────────────────────┐
                    └──────┬──────┘                      │
              confirm/pay  │                             │ cancel
           (dashboard only)│                             ▼
                    ┌──────▼──────┐              ┌─────────────┐
                    │  CONFIRMED  │─────────────▶│  CANCELLED  │
                    └──────┬──────┘   cancel     └─────────────┘
                           │          (dashboard only)
                    ┌──────▼──────┐              ┌─────────────┐
                    │  PROCESSING │─────────────▶│  CANCELLED  │
                    └──────┬──────┘   cancel*    └─────────────┘
                           │         (dashboard only)
                    ┌──────▼──────┐  * alerta: notificar cocina verbalmente
                    │  COMPLETED  │
                    └─────────────┘
```

### Reglas de transición

| Desde | Hacia | Actor | Condición |
|---|---|---|---|
| `CREATED` | `CONFIRMED` | Dashboard | Cajero confirma manualmente, o automático según origen |
| `CREATED` | `CANCELLED` | Dashboard | Solo si `isPaid = false` |
| `CONFIRMED` | `PROCESSING` | Dashboard o KDS | Cocinero "toma" el pedido |
| `CONFIRMED` | `CANCELLED` | Dashboard | Solo si `isPaid = false` |
| `PROCESSING` | `COMPLETED` | Dashboard o KDS | Cocinero marca listo |
| `PROCESSING` | `CANCELLED` | Dashboard | Solo si `isPaid = false`. Genera alerta verbal |
| `COMPLETED` | — | — | Estado terminal — no se puede cancelar ni revertir |
| `CANCELLED` | — | — | Estado terminal |

### Regla de cancelación con pago

Un pedido con `isPaid = true` **no puede cancelarse directamente**.
- Error: `CANNOT_CANCEL_PAID_ORDER`
- El cajero debe ejecutar `PATCH /:id/unpay` primero, luego cancelar.
- Garantía: un pedido `CANCELLED` siempre tiene `isPaid = false`.

---

## Flujo por origen (`orderSource`)

### KIOSK — Kiosk de autoservicio

```
Cliente ordena en el totem
        │
        ▼
   [CREATED] ← orderSource: KIOSK
        │
   ┌────┴────────────────────┐
   │                         │
   │ Cliente paga en totem   │ Cliente recibe ticket
   │                         │ y paga en caja
   ▼                         ▼
[CONFIRMED]            Cajero: confirmar o pagar
  isPaid=true              → [CONFIRMED]
        │
        ▼
  Cocina lo ve
  Cocinero: "Tomar"
        │
        ▼
  [PROCESSING]
        │
        ▼
  Cocinero: "Listo"
        │
        ▼
  [COMPLETED]
```

### WEB — Pedido online

```
Cliente ordena desde la web
        │
        ▼
   [CREATED] ← orderSource: WEB
        │
   Pasarela confirma pago (webhook)
        │
        ▼
   [CONFIRMED] ← auto-confirmado, isPaid=true
        │
        ▼
   Cocina lo ve → Tomar → PROCESSING → Listo → COMPLETED
```

### STAFF — Creado desde el dashboard

```
Admin/Manager crea pedido desde dashboard
        │
        ▼
   [CONFIRMED] ← auto-confirmado al crear, orderSource: STAFF
        │
        ▼
   Cocina lo ve → Tomar → PROCESSING → Listo → COMPLETED
```

---

## Nuevos campos en el modelo `Order`

### `orderSource: String`

Origen del pedido. Valores válidos: `KIOSK`, `WEB`, `STAFF`.
Tipo `String` (varchar) — validado en DTO con `@IsIn`. No enum en BD para facilitar extensión futura.

| Valor | Quién lo asigna | Auto-confirma |
|---|---|---|
| `KIOSK` | KioskModule al crear | No — espera pago o confirmación del cajero |
| `WEB` | KioskModule / WebModule al crear | Sí — al recibir confirmación de pasarela |
| `STAFF` | OrdersController (dashboard) al crear | Sí — inmediatamente |

### `orderType: String`

Tipo de entrega. Valores válidos: `PICKUP`, `DELIVERY`, `DINE_IN`.
Tipo `String` (varchar) — validado en DTO con `@IsIn`. No enum en BD.

| Valor | Descripción |
|---|---|
| `PICKUP` | Cliente retira en el local |
| `DELIVERY` | Se envía a domicilio del cliente |
| `DINE_IN` | Consumo en el restaurante, se lleva a la mesa |

### `tableNumber: String | null`

Número de mesa. Solo requerido cuando `orderType = DINE_IN`.
Validación: si `orderType = DINE_IN` y `tableNumber` es nulo → error de validación `400`.

---

## Cambios en la API

### Nuevo endpoint: `PATCH /v1/orders/:id/confirm`

Mueve un pedido de `CREATED` a `CONFIRMED`. Solo para pedidos de origen `KIOSK` pendientes de confirmación manual.

| Campo | Valor |
|---|---|
| Roles | ADMIN, MANAGER |
| Body | — (sin body) |
| Respuesta | `OrderDto` |
| Errores | `ORDER_NOT_FOUND`, `INVALID_STATUS_TRANSITION` (si no está en CREATED) |

### Nuevo endpoint: `PATCH /v1/orders/:id/unpay`

Marca un pedido como no pagado (`isPaid = false`). Independiente del estado. Paso previo obligatorio para cancelar un pedido pagado.

| Campo | Valor |
|---|---|
| Roles | ADMIN, MANAGER |
| Body | — (sin body) |
| Respuesta | `OrderDto` |
| Errores | `ORDER_NOT_FOUND` |

### Modificado: `PATCH /v1/orders/:id/pay`

Comportamiento adicional: si el pedido está en `CREATED`, también lo mueve a `CONFIRMED`.
- `CREATED + pay` → `isPaid=true` + `status=CONFIRMED`
- `CONFIRMED/PROCESSING + pay` → solo `isPaid=true` (sin cambio de estado)

### Modificado: `PATCH /v1/orders/:id/cancel`

Nueva validación: si `isPaid = true` → lanza `CANNOT_CANCEL_PAID_ORDER (409)`.
Estados cancelables: `CREATED`, `CONFIRMED`, `PROCESSING`.
`COMPLETED` sigue sin poder cancelarse (`INVALID_STATUS_TRANSITION`).

### Modificado: `PATCH /v1/orders/:id/status`

El array `STATUS_ORDER` se actualiza a: `[CREATED, CONFIRMED, PROCESSING, COMPLETED]`.
Transiciones válidas vía dashboard: `CONFIRMED → PROCESSING`, `PROCESSING → COMPLETED`.
`CREATED → CONFIRMED` se maneja por `/confirm` y `/pay`, no por este endpoint.

### Modificado: `GET /v1/orders`

Fix de búsqueda por `orderNumber`: cuando se provee `orderNumber` sin `statuses`, se busca en **todos los estados** del turno activo (no se aplica el default `CREATED, PROCESSING`).

### Eliminado: `cancelOrder` en `KitchenService`

La cocina pierde la capacidad de cancelar pedidos. Se elimina el método `cancelOrder` del `KitchenService` y su endpoint correspondiente en el `KitchenController`.

---

## Cambios en el KDS (Kitchen Display)

### Filtro de órdenes visibles

Antes: `status IN (CREATED, PROCESSING)`
Después: `status IN (CONFIRMED, PROCESSING)`

### Acciones disponibles

| Acción | Estado actual | Estado siguiente | Quién |
|---|---|---|---|
| "Tomar" | `CONFIRMED` | `PROCESSING` | Cocinero |
| "Listo" | `PROCESSING` | `COMPLETED` | Cocinero |
| ~~Cancelar~~ | — | — | Eliminado |

### Información adicional en la tarjeta

Cada tarjeta de pedido muestra:
- `orderType`: icono o etiqueta (🏠 Delivery / 🥡 Para llevar / 🍽️ Mesa)
- `tableNumber`: número de mesa si `orderType = DINE_IN`

### Comportamiento al cancelar desde dashboard

Cuando un pedido en `CONFIRMED` o `PROCESSING` es cancelado desde el dashboard:
- El pedido desaparece del KDS vía SSE (evento `order:updated`)
- La tarjeta se marca brevemente en rojo con el texto "CANCELADO" antes de salir de pantalla

---

## Cambios en el Dashboard (Orders UI)

### Cambio en botones de `OrderCard`

| Estado | Botón | Acción |
|---|---|---|
| `CREATED` | "Confirmar" *(antes era "Procesar")* | `PATCH /:id/confirm` |
| `CONFIRMED` | "Procesar" → avanza a PROCESSING | `PATCH /:id/status` |
| `PROCESSING` | "Completar" | `PATCH /:id/status` |
| `isPaid = true` (cualquier estado activo) | "Desmarcar Pago" | `PATCH /:id/unpay` |

> El botón "Procesar" se mueve de `CREATED` a `CONFIRMED`. En `CREATED` el cajero solo puede Confirmar (o Cancelar si no está pagado).

### Diálogos de confirmación

- Antes de ejecutar `PATCH /:id/pay`: *"¿Confirmar pago del pedido #N?"*
- Antes de avanzar `PROCESSING → COMPLETED`: *"¿Marcar pedido #N como completado?"*

### Bloqueo de cancelación con pago

Si `isPaid = true` y el cajero intenta cancelar:
- El botón "Cancelar" muestra un mensaje: *"Este pedido está marcado como pagado. Desmarca el pago antes de cancelarlo."*
- No se abre el modal de cancelación.

### Toast especial al cancelar PROCESSING

Cuando se cancela un pedido en estado `PROCESSING`:
- Toast diferenciado: `⚠️ Pedido cancelado. Recuerda notificar a tu cocina.`

### Fix de búsqueda por número de pedido

En `OrdersPanel.tsx`, función `fetchOrders`:
- Cuando `filter.orderNumber` está presente y `filter.statuses` está vacío, **no se aplican statuses por defecto**. Se envía la búsqueda sin filtro de estado para encontrar el pedido en cualquier estado del turno activo.

---

## Migración de base de datos

```prisma
// 1. Extender enum OrderStatus
enum OrderStatus {
  CREATED
  CONFIRMED   // nuevo
  PROCESSING
  COMPLETED
  CANCELLED
}

// 2. Nuevos campos en Order
model Order {
  // ... campos existentes ...
  orderSource  String?  // KIOSK | WEB | STAFF
  orderType    String?  // PICKUP | DELIVERY | DINE_IN
  tableNumber  String?  // solo si orderType = DINE_IN
}
```

**Valores por defecto para registros existentes:**
- `orderSource`: `null` (registros históricos no tienen origen definido)
- `orderType`: `null` (registros históricos no tienen tipo definido)
- `tableNumber`: `null`

Los campos son opcionales en BD pero **requeridos en los DTOs de creación** para órdenes nuevas, con la excepción de `tableNumber` que solo es requerido cuando `orderType = DINE_IN`.

**Consideración de deploy — órdenes `CREATED` activas:**
Al momento del deploy, cualquier orden en estado `CREATED` dentro del turno activo dejará de aparecer en el KDS (que pasará a filtrar `CONFIRMED+PROCESSING`). Opciones:
- **Recomendado:** incluir en la migración un `UPDATE` que mueva las órdenes `CREATED` del turno activo a `CONFIRMED`. Es un caso raro en producción pero evita confusión operativa.
- Alternativa: el cajero las confirma manualmente desde el dashboard antes del deploy.

**Nombre de migración sugerido:** `add_confirmed_state_order_source_type`

---

## Documentación a actualizar

### `orders.module.info.md`
- Actualizar la tabla de endpoints con los nuevos (`/confirm`, `/unpay`)
- Actualizar la sección de máquina de estados con el nuevo flujo
- Documentar los nuevos campos `orderSource`, `orderType`, `tableNumber`
- Documentar la regla `CANNOT_CANCEL_PAID_ORDER`

### `kitchen.service` / módulo kitchen
- Actualizar para reflejar que el KDS ya no puede cancelar
- Documentar los estados visibles: `CONFIRMED` y `PROCESSING`

### Nuevo archivo: `docs/orders-flow.md`
Documento de referencia del flujo completo de una orden, por origen y tipo. Ver sección siguiente.

---

## Nuevo archivo: flujo de órdenes de referencia

Debe crearse como `apps/api-core/docs/orders-flow.md` con el siguiente contenido mínimo:

- Diagrama de la máquina de estados completa
- Flujo por origen: KIOSK (pago en totem), KIOSK (ticket en caja), WEB, STAFF
- Tabla de quién puede hacer qué transición
- Reglas de `isPaid` y su relación con la cancelación
- Ejemplos de casos de error comunes y cómo resolverlos

---

## Fuera de scope (próximo spec)

Los siguientes items de Problema 1 se diseñarán en el spec siguiente, en el contexto de la nueva máquina de estados:

- Reactivar pedidos cancelados (`CANCELLED → CREATED`)
- Revertir un pedido completado (`COMPLETED → PROCESSING`)
- Integración de pasarela de pago (webhook para auto-confirmar pedidos `WEB`)
