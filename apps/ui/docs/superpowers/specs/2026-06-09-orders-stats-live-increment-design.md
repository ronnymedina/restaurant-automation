# Diseño — Stats del panel de órdenes en vivo por incremento local (R2-05)

**Fecha:** 2026-06-09
**Hallazgo origen:** R2-05 (🟡 MEDIO) en `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`
**Apps:** `apps/ui` (solo frontend)
**Tipo:** Diseño (no implementación)

---

## Problema

`OrderStatsPanel.refresh()` se dispara en **cada** evento SSE (`order:new` y `order:updated`)
desde `OrdersPanel.tsx:159,167`. Cada `refresh()` hace `GET /v1/cash-register/stats`, un
endpoint caro (`groupBy` multidimensional + top products con join de nombres). En hora pico,
una ráfaga de N órdenes dispara N agregaciones **por cada cliente conectado** (dashboard +
cajas). Sin debounce; refetches solapados → el último en resolver gana.

Esto reintroduce el patrón "N eventos = N refetch" que H-AUX-02 ya había eliminado para la
lista de órdenes (que hoy se actualiza por patch local).

## Objetivo

- El endpoint pesado (`GET /v1/cash-register/stats`) se llama **solo** cuando el usuario toca
  el botón "Actualizar" (más el fetch inicial de montaje).
- Las stats se actualizan **en vivo por incremento local** a partir de los payloads SSE, sin
  pegarle al backend.
- El botón sigue siendo la **fuente de verdad**: reconcilia cualquier drift acumulado.

## No-objetivos (YAGNI)

- No se mantienen en vivo `byPaymentMethod`, `byOrderType`, `byOrderSource` ni `topProducts`.
  El `OrderStatsPanel` no los renderiza; reflejan el último refetch. (`topProducts` no es
  derivable del SSE: `OrderItemEventPayload` no trae product id ni total por ítem.)
- No se cambia la máquina de estados ni el cálculo del cierre de caja.
- No se introduce zustand (ver "Arquitectura" para el porqué).

---

## Arquitectura — el padre (`OrdersPanel`) como manager

Hoy `OrderStatsPanel` es el único hijo del panel con **estado y request propios** (su
`useState` de `stats` + `getLiveStats()` vía `forwardRef`/`useImperativeHandle`). El resto de
los hijos (`OrderCard`) ya son presentacionales: reciben callbacks y disparan eventos hacia el
padre, que es quien tiene `orders[]`, aplica patches optimistas y hace los requests.

Este cambio **alinea las stats al mismo patrón**: subir el estado `summary` al `OrdersPanel`.

| Responsabilidad | Antes | Después |
|---|---|---|
| Estado `summary` | en `OrderStatsPanel` | **en `OrdersPanel`** |
| `getLiveStats()` (refetch) | el hijo, vía `refresh()` imperativo | **el padre**, solo en botón + montaje |
| `order:new` | hacía `refresh()` | **el padre**: `setSummary(applyOrderEvent(prev, null, payload))` |
| `order:updated` | hacía `refresh()` | **el padre**: `setSummary(applyOrderEvent(prev, oldOrder, payload))` |
| `OrderStatsPanel` | stateful + `forwardRef` | **presentacional puro**: props `summary`, `loading`, `lastUpdated`, `error`, `onRefresh` |

### Por qué no zustand

`OrderStatsPanel` es hijo **directo** de `OrdersPanel` y los eventos SSE entran al padre.
Subir el estado al padre y pasar props es suficiente: se resetea solo al desmontar/cambiar de
turno, no introduce estado global singleton que limpiar en tests, y deja toda la lógica de
deltas colocada con los handlers SSE. Zustand sería la elección correcta solo si aparecieran
consumidores de stats fuera de este árbol (p.ej. un badge global); hoy no los hay y migrar
luego es trivial.

---

## El modelo de deltas: `contribution(order)`

En vez de casos especiales por transición (cobrar, cancelar, completar…), modelamos la
**contribución** de una orden a las stats con **los mismos predicados que el backend**
(`cash-register-stats.service.ts:88-135`). Cualquier transición es:

```
applyOrderEvent(summary, oldOrder, newOrder):
    next = summary
    if oldOrder: next = next - contribution(oldOrder)
    if newOrder: next = next + contribution(newOrder)
    next.revenue.averageTicket = next.paidCount > 0 ? next.revenue.collected / next.paidCount : 0
    return next
```

- `order:new`  → `applyOrderEvent(summary, null, payload)`
- `order:updated` → `applyOrderEvent(summary, oldOrder, payload)` (oldOrder = la orden previa
  del array local `orders`)

### `contribution(order)` — predicados idénticos al backend

Dado `order = { status, isPaid, totalAmount }`:

| Campo del summary | Aporte de la orden | Predicado backend de referencia |
|---|---|---|
| `counts.total` | `+1` | `buildCounts`: suma de todos los buckets |
| `counts[status]` | `+1` al bucket de su `status` | `buildCounts` |
| `counts.pending` | `+1` si `status ∉ {COMPLETED, CANCELLED}` | `pending = total - completed - cancelled` |
| `revenue.collected` | `+totalAmount` si `isPaid && status ≠ CANCELLED` | `calculateRevenue.collected` |
| `revenue.pending` | `+totalAmount` si `!isPaid && status ≠ CANCELLED` | `calculateRevenue.pending` |
| `paidCount` (interno) | `+1` si `isPaid && status ≠ CANCELLED` | divisor de `averageTicket` |

`averageTicket` es **derivado** (`collected / paidCount`), no se acumula. `paidCount` es un
contador interno del summary local (no lo expone el endpoint, pero es trivial de mantener).

> **Nota de unidades:** `summary.revenue.*` y `payload.totalAmount` viajan ambos **en pesos**
> (float, ya pasados por `fromCents` en los serializers). Los deltas se suman directo. La
> aritmética flotante puede acumular error sub-centavo durante el turno; es display y se
> reconcilia con el botón. `averageTicket` local usa división flotante y diferirá levemente
> del floor-division-en-centavos del backend (audit H-30) — aceptable, reconciliado por el
> botón.

### Ejemplos verificables

- **Cobrar** `SERVED → SERVED, isPaid false→true` (totalAmount 100):
  `-contribution(SERVED,false)` quita `pending -=100`; `+contribution(SERVED,true)` suma
  `collected +=100, paidCount +=1`. counts sin cambio. ✓
- **Cancelar** `SERVED,false → CANCELLED,false` (totalAmount 100): quita `pending -=100`,
  `counts.served -=1`, `counts.pending -=1`; agrega `counts.cancelled +=1`. `total` sin cambio.
  collected sin cambio (no estaba pagada). ✓
- **Completar** `SERVED,true → COMPLETED,true`: quita `counts.served -=1, counts.pending -=1`;
  agrega `counts.completed +=1`. revenue sin cambio (sigue paga). ✓
- **Nuevo pedido** kiosk `CREATED,false` (totalAmount 100): `total +=1, created +=1,
  pending +=1, revenue.pending +=100`. ✓

---

## Por qué NO se toca el backend (`order:updated` no necesita `totalAmount`)

`OrderUpdatedPayload` hoy no incluye `totalAmount`, y **se deja así**. El delta de un
`order:updated` es `-contribution(ordenVieja) + contribution(ordenNueva)`, y:

1. **`totalAmount` es inmutable** — se fija al crear la orden; cobrar/cancelar/avanzar no lo
   cambian.
2. Calcular el delta requiere la **orden vieja** del array local (para restar su contribución
   previa). Si la orden no está en la lista, el delta se **omite** de todas formas.
3. Toda orden presente en la lista **ya tiene `totalAmount`**: entró por el fetch REST inicial
   (`getOrders`, pesos) o por un `order:new` (que sí lo trae). La orden nueva es
   `{ ...vieja, ...payload }`, así que hereda ese mismo `totalAmount`.

Conclusión: siempre que *podemos* calcular el delta, `totalAmount` ya está disponible localmente.
Repetirlo en el payload no agrega información. Esto mantiene el cambio **solo en `apps/ui`**, sin
riesgo de drift del contrato SSE.

---

## Flujo de datos resultante

```
order:new    ─► handleNew    ─► setSummary(applyOrderEvent(prev, null, payload))   (siempre, antes del guard de filtro)
                              └► (no-filtro) setOrders(prepend con dedup)
order:updated ─► handleUpdated ─► oldOrder = orders.find(id)
                              ├► newOrder = { ...oldOrder, ...payload }   (hereda totalAmount)
                              ├► setOrders(merge {...old, ...payload})
                              └► oldOrder ? setSummary(applyOrderEvent(prev, oldOrder, newOrder)) : skip
botón "Actualizar" / montaje ─► getLiveStats() ─► setSummary(authoritative)   ◄── única llamada al endpoint
```

`OrderStatsPanel` recibe `summary`, `loading`, `lastUpdated`, `error`, `onRefresh` por props y
solo renderiza. Se elimina `forwardRef`/`useImperativeHandle`/`getLiveStats` del hijo.

---

## Casos borde y cómo se manejan

| Caso | Manejo |
|---|---|
| **Idempotencia / evento duplicado** | `SseService` usa `Subject` de RxJS **sin replay** (`sse.service.ts:13-14`): cada `order:new` se entrega exactamente una vez por orden, sin reenvío en reconexión. Por eso el delta de `order:new` se aplica **una vez por evento** sin necesidad de un guard de dedup propio. El `prev.some(o=>o.id)` de `setOrders` queda como defensa de la **lista**, no de las stats. |
| **`order:updated` de orden fuera del array local** (modo filtro, tope 100, completada que salió del fetch) | `orders.find(id)` no la encuentra → no hay `oldOrder` → se **omite** el delta. Drift reconciliado por el botón. |
| **`summary === null`** (aún cargando el fetch inicial) | Los handlers omiten el delta si `summary` es null. El fetch en vuelo traerá el estado base. |
| **Race fetch inicial vs. incremento temprano** | Posible doble conteo si un evento llega mientras el fetch de montaje está en vuelo. Aceptado como drift menor; el botón reconcilia. |
| **Reconexión SSE** (`handleOpen` con `hasConnectedBefore`) | Hoy refetchea la lista; **se agrega** un `refresh()` de stats en ese mismo punto para cerrar el gap de eventos perdidos durante el blip. |
| **Modo filtro** | `handleNew` hoy retorna temprano con filtro activo (no toca la lista). Las stats son globales del turno, no dependen del filtro: **decisión** — el delta de `order:new` se aplica **siempre**, reordenando el handler para que el incremento de stats ocurra antes del `return` por filtro. (El delta de `order:updated` ya es independiente del filtro porque `handleUpdated` no tiene guard de filtro.) |
| **Acciones del propio cajero** (pay/cancel/advance) | Generan su `order:updated` por SSE igual que las de otros clientes → mismo camino de delta. No requieren tratamiento especial. |

---

## Componentes y sus interfaces

### `applyOrderEvent` + `contribution` (funciones puras)

Módulo nuevo `apps/ui/src/components/dash/orders/stats-delta.ts`:

```ts
export function contribution(order: Pick<Order,'status'|'isPaid'|'totalAmount'>): SummaryDelta;
export function applyOrderEvent(
  summary: LiveSummary,
  oldOrder: OrderLike | null,
  newOrder: OrderLike | null,
): LiveSummary;
```

`LiveSummary` = `ShiftSummary` + `paidCount` interno. Puras → testeables sin montar componentes.

### `OrdersPanel` (manager)

- Dueño de `orders[]` **y** `summary` (`useState<LiveSummary | null>`).
- `fetchStats()` (botón + montaje + reconexión) → `getLiveStats()` → `setSummary`.
- Handlers SSE despachan `applyOrderEvent`.
- Pasa props a `<OrderStatsPanel>`.

### `OrderStatsPanel` (presentacional)

- Props: `summary`, `loading`, `lastUpdated`, `error`, `onRefresh`.
- Sin estado, sin ref, sin request. `useRestaurantSettings()` para formato se mantiene (es display).

---

## Testing (TDD)

1. **`stats-delta.test.ts`** (unit, núcleo): cada transición de la tabla de ejemplos
   (cobrar, desmarcar, cancelar, completar, avanzar, nuevo kiosk/staff) verifica el summary
   resultante. Incluir: doble aplicación idempotente, `oldOrder=null`, recompute de
   `averageTicket`.
2. **`OrdersPanel.test.tsx`** (regresión): un burst de N eventos SSE produce **0** llamadas a
   `getLiveStats()`; el botón produce exactamente 1; las stats reflejan el incremento.

> Sin tests de backend: este cambio es solo `apps/ui` (ver "Por qué NO se toca el backend").

---

## Riesgos

- **Drift acumulado**: float pesos + casos borde de orden-fuera-de-lista. Mitigado por el botón
  como fuente de verdad y por usar predicados idénticos al backend. Si el drift molestara, un
  refetch perezoso de respaldo (intervalo largo) es una extensión futura, no parte de este scope.
- **Desfase del cobro en vivo**: un `order:updated` cuya orden no está en el array local (modo
  filtro, tope 100) no incrementa stats hasta el botón. Es el trade-off aceptado del modelo
  best-effort.
