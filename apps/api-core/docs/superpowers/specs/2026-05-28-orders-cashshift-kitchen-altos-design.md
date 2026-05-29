# Design: Hardening ALTOS — Orders, Cash-Shift, Kitchen (Batch 3)

**Fecha:** 2026-05-28
**Estado:** Aprobado (pendiente plan de implementación)
**Hallazgos cubiertos:** H-10, H-16, H-17, H-18, H-20 (+ cleanup H-19)
**Auditoría base:** `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`
**Specs relacionados:**
- `2026-05-17-order-state-machine-design.md` — define las reglas que H-16 centraliza
- `2026-05-27-orders-cashshift-kitchen-token-hardening-design.md` — batch 1 (H-05/06/09/13/14)
- `2026-05-28-orders-cashshift-kitchen-hardening-batch2-design.md` — batch 2 (H-07/08/11/12/15)

---

## Resumen ejecutivo

Cierra los 5 ALTOS pendientes de la auditoría 2026-05-24 + descarta formalmente H-19 (código removido en H-03). Mezcla un refactor de centralización (H-16), dos fixes mecánicos de backend (H-10, H-20), y dos fixes de UX/correctitud en frontend (H-17, H-18). Sin dependencias entre items — pueden mergearse en commits separados.

| ID | Tipo | Archivos principales | Esfuerzo |
|----|------|----------------------|----------|
| H-19 | Cleanup doc | `audit-findings.md` | 1 edición |
| H-10 | Backend (firma) | `cash-register.service.ts` | 1 línea + JSDoc |
| H-20 | Backend (comentarios) | `orders.service.ts`, `kitchen.controller.ts` | 2 comentarios |
| H-16 | Backend (refactor) | nuevo `order-state-machine.ts` + `orders.service.ts` + `update-kitchen-status.dto.ts` + specs | Medio |
| H-17 | Frontend | `OrdersPanel.tsx` | Bajo |
| H-18 | Frontend | `OrdersPanel.tsx` + `OrderCard.tsx` | Bajo-medio |

Fuera de scope (tracker explícito):
- **H-04** sigue deferred — requiere diseño separado del mecanismo `sse-ticket`.
- **H-AUX-02** (refetch completo en cada evento SSE) — nuevo hallazgo descubierto durante el diseño; documentado en el audit y deferido a spec propio.
- **`cancelOrder` sin optimistic concurrency** — deuda colateral descubierta durante H-13; abrir como hallazgo nuevo en el audit antes de atacarlo.

---

## H-19 — `handleReceipt` falla silenciosamente (descartado)

**Decisión:** ❌ Descartado. El módulo de recibo del dashboard se borró completamente en H-03 (cleanup de XSS + dead code). `handleReceipt`, `onReceipt` y el endpoint `POST /v1/print/receipt/:id` no existen. No hay código que arreglar.

**Verificación:** `grep -rn "handleReceipt\|onReceipt" apps/ui/src/components/dash/orders/` retorna 0 resultados (2026-05-28).

**Cambios:**
- Actualizar el bloque H-19 del audit doc al formato `❌ Descartado` con la justificación.
- Actualizar el resumen ejecutivo y el cuadro "Orden sugerido de remediación".

---

## H-10 — `closeSession` con `closedBy` requerido

**Problema:** la firma `closeSession(restaurantId: string, closedBy?: string)` permite cerrar un turno sin trazabilidad. Hoy el único caller HTTP siempre pasa `user.id`, pero un futuro caller interno (CLI, job de reconciliación) podría cerrar dejando `closedById = NULL`.

**Cambio:**

```ts
// apps/api-core/src/cash-register/cash-register.service.ts:40
- async closeSession(restaurantId: string, closedBy?: string) {
+ async closeSession(restaurantId: string, closedBy: string) {
```

Agregar JSDoc:
```ts
/**
 * Cierra el turno abierto del restaurante.
 *
 * @param closedBy Identificador del actor que cierra. DEBE ser el id del
 * user JWT en flujos HTTP, o un identificador único de proceso en jobs
 * internos (ej. "system:reconciliation"). La columna `closedById` queda
 * garantizada non-null para auditoría financiera.
 */
```

**Tests:** el test existente sigue pasando porque siempre pasa `closedBy`. Verificar en `cash-register.service.spec.ts` y agregar 1 caso explícito si no existe que confirme que el `update` recibe `closedBy`.

**Impacto:** ninguno en runtime — sólo bloquea callers internos descuidados en compile-time.

---

## H-20 — `kitchenAdvanceStatus` confía en caller para `restaurantId`

**Auditoría completada:** `kitchen.controller.ts:99-103` deriva `restaurantId` de `KITCHEN_RESTAURANT_KEY` (setteado por `KitchenTokenGuard`), no del body. **El aislamiento multi-tenant es correcto hoy.**

**Cambios mínimos para blindar la convención:**

1. **JSDoc en `orders.service.ts:184`:**
```ts
/**
 * Avanza el estado de una orden desde la cocina (CONFIRMED → PROCESSING → SERVED).
 *
 * IMPORTANTE — Multi-tenant safety: `restaurantId` DEBE provenir del actor
 * autenticado (JWT del cajero o KitchenTokenGuard.KITCHEN_RESTAURANT_KEY),
 * nunca del body del request. La protección por findFirst({ where: { id,
 * restaurantId } }) depende 100% de que el caller respete esta convención.
 */
async kitchenAdvanceStatus(...)
```

2. **Comentario corto en `kitchen.controller.ts:100`:**
```ts
return this.kitchenService.advanceStatus(
  (req as any)[KITCHEN_RESTAURANT_KEY],  // setteado por KitchenTokenGuard — no del body
  id,
  dto.status,
);
```

**Sin cambios de comportamiento. Sin tests nuevos.**

**Descartado por overkill:** branded type para `restaurantId` que solo el guard pueda producir. Demasiado invasivo para el beneficio.

---

## H-16 — Clase `OrderStateMachine`

### Contexto y antecedente

El spec `2026-05-17-order-state-machine-design.md` ya definió las **reglas** de la máquina de estados (matriz de transiciones por actor, invariantes, condiciones de pago/cancelación) y propuso extraerlas a **helpers privados** dentro de `orders.service.ts` (`assertSequentialTransition`, `assertKitchenMaxStatus`, etc.).

El estado actual del código muestra que esa extracción nunca se completó: la lógica sigue inline y duplicada en 5 lugares de `orders.service.ts`, más el `UpdateKitchenStatusDto`. La auditoría 2026-05-24 capturó esto como H-16, identificando específicamente que el chequeo dual (`targetIdx !== currentIdx + 1 || targetIdx > KITCHEN_MAX_IDX`) es código muerto frágil: si el enum `OrderStatus` cambia en el futuro, la segunda guarda silenciosamente deja de proteger.

Este spec completa el trabajo del spec de mayo 17 con un paso adicional: en lugar de helpers privados, extraer las reglas a una **clase dedicada testeable en aislamiento y reutilizable desde el DTO**.

### Diseño

**Archivo nuevo:** `apps/api-core/src/orders/order-state-machine.ts`

```ts
import { OrderStatus } from '@prisma/client';
import {
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';

export const STATUS_ORDER: readonly OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SERVED,
  OrderStatus.COMPLETED,
] as const;

export const KITCHEN_ALLOWED_TARGETS: readonly OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.SERVED,
] as const;

export type Actor = 'cashier' | 'kitchen';

export class OrderStateMachine {
  static readonly STATUS_ORDER = STATUS_ORDER;
  static readonly KITCHEN_ALLOWED_TARGETS = KITCHEN_ALLOWED_TARGETS;

  /**
   * Valida una transición de estado +1 en STATUS_ORDER para el actor dado.
   * - Cualquier actor: target debe ser el siguiente índice (sin saltos, sin retrocesos).
   * - Kitchen: target adicionalmente debe estar en KITCHEN_ALLOWED_TARGETS.
   * - Cashier alcanzando COMPLETED: requiere isPaid. Use `assertCanComplete` para esa rama.
   *
   * Lanza InvalidStatusTransitionException si la transición es inválida.
   */
  static assertCanAdvance(from: OrderStatus, to: OrderStatus, actor: Actor): void;

  /**
   * Variante de assertCanAdvance que también verifica isPaid cuando el target es COMPLETED.
   * Solo aplicable al actor 'cashier' (kitchen nunca puede llegar a COMPLETED).
   */
  static assertCanComplete(from: OrderStatus, isPaid: boolean): void;

  /**
   * Valida que el estado actual permite cancelar.
   * Lanza:
   *   - OrderAlreadyCancelledException si from === CANCELLED
   *   - InvalidStatusTransitionException si from === COMPLETED
   *   - CannotCancelPaidOrderException si isPaid
   */
  static assertCanCancel(from: OrderStatus, isPaid: boolean): void;

  /**
   * Valida que el estado permite marcar como pagado.
   * Reglas exactas: replicar el comportamiento actual de markAsPaid en orders.service.ts.
   * (A confirmar leyendo el método durante implementación — no reinventar reglas.)
   */
  static assertCanMarkPaid(from: OrderStatus, isPaid: boolean): void;

  /**
   * Valida que el estado permite desmarcar el pago.
   * Reglas exactas: replicar el comportamiento actual de unmarkAsPaid.
   */
  static assertCanUnmarkPaid(from: OrderStatus, isPaid: boolean): void;
}
```

### Matriz de reglas (alineada con spec 2026-05-17)

| Transición | Cashier | Kitchen | Condición adicional |
|------------|---------|---------|---------------------|
| CREATED → CONFIRMED | ✅ | ❌ | — |
| CONFIRMED → PROCESSING | ✅ | ✅ | — |
| PROCESSING → SERVED | ✅ | ✅ | — |
| SERVED → COMPLETED | ✅ | ❌ | `isPaid = true` |
| Cualquier → CANCELLED (excepto COMPLETED) | ✅ | ❌ | `!isPaid` |
| Salto de pasos | ❌ | ❌ | — |
| Retroceso | ❌ | ❌ | — |

### Cómo se reemplaza el código actual

**Antes** — `kitchenAdvanceStatus` (`orders.service.ts:198-203`):
```ts
const currentIdx = STATUS_ORDER.indexOf(order.status);
const targetIdx = STATUS_ORDER.indexOf(newStatus);
const KITCHEN_MAX_IDX = STATUS_ORDER.indexOf(OrderStatus.SERVED);
if (targetIdx === -1 || targetIdx !== currentIdx + 1 || targetIdx > KITCHEN_MAX_IDX) {
  throw new InvalidStatusTransitionException(order.status, newStatus);
}
```

**Después:**
```ts
OrderStateMachine.assertCanAdvance(order.status, newStatus, 'kitchen');
```

**Antes** — `cancelOrder` (`orders.service.ts:173-178`):
```ts
if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);
if (order.status === OrderStatus.COMPLETED) {
  throw new InvalidStatusTransitionException(order.status, OrderStatus.CANCELLED);
}
if (order.isPaid) throw new CannotCancelPaidOrderException(id);
```

**Después:**
```ts
OrderStateMachine.assertCanCancel(order.status, order.isPaid);
```

**Antes** — `update-kitchen-status.dto.ts:5-11`:
```ts
@IsEnum([$Enums.OrderStatus.PROCESSING, $Enums.OrderStatus.SERVED], {
  message: 'Kitchen can only advance to PROCESSING or SERVED',
})
status: $Enums.OrderStatus;
```

**Después:**
```ts
import { KITCHEN_ALLOWED_TARGETS } from '../../orders/order-state-machine';

@IsEnum(KITCHEN_ALLOWED_TARGETS, {
  message: `Kitchen can only advance to ${KITCHEN_ALLOWED_TARGETS.join(' or ')}`,
})
status: $Enums.OrderStatus;
```

Una sola fuente de verdad. Agregar/quitar un estado del enum se propaga automáticamente a DTO, service y tests.

### Por qué clase con métodos estáticos (no funciones sueltas, no instancia)

- **Métodos estáticos** (vs. funciones sueltas): agrupa las reglas bajo un namespace claro (`OrderStateMachine.assertCanAdvance` se lee como "regla del state machine", no como helper utilitario suelto). Coincide con el modelo mental del usuario ("una clase que maneja los estados").
- **Sin estado interno**: la state machine es una tabla de reglas, no un objeto vivo. Instanciar `new OrderStateMachine(order)` por cada transición es overhead sin beneficio. Los `assert*` reciben los datos necesarios como argumentos.

### Tests

**Nuevo:** `apps/api-core/src/orders/order-state-machine.spec.ts` (unit puro, sin Prisma, sin DI).

Casos mínimos:

| Test | Esperado |
|------|----------|
| `assertCanAdvance(CONFIRMED, PROCESSING, 'kitchen')` | OK |
| `assertCanAdvance(PROCESSING, SERVED, 'kitchen')` | OK |
| `assertCanAdvance(CONFIRMED, SERVED, 'kitchen')` | InvalidStatusTransition (salto) |
| `assertCanAdvance(SERVED, COMPLETED, 'kitchen')` | InvalidStatusTransition (fuera de KITCHEN_ALLOWED_TARGETS) |
| `assertCanAdvance(PROCESSING, CONFIRMED, 'cashier')` | InvalidStatusTransition (retroceso) |
| `assertCanComplete(SERVED, true)` | OK |
| `assertCanComplete(SERVED, false)` | OrderNotPaid |
| `assertCanComplete(PROCESSING, true)` | InvalidStatusTransition (no es +1) |
| `assertCanCancel(CONFIRMED, false)` | OK |
| `assertCanCancel(CANCELLED, false)` | OrderAlreadyCancelled |
| `assertCanCancel(COMPLETED, true)` | InvalidStatusTransition |
| `assertCanCancel(SERVED, true)` | CannotCancelPaidOrder |

**Refactor:** `orders.service.spec.ts` debe seguir pasando sin cambios (mismo comportamiento externo). Tests redundantes en los `describe('kitchenAdvanceStatus')` etc. pueden simplificarse, pero no es obligatorio — el spec del state machine los cubre con más exhaustividad.

### Riesgos del refactor

- `orders.service.ts` es código caliente. Cobertura existente alta (unit + e2e) + tests nuevos del state machine minimizan riesgo de regresión.
- **Antes de implementar `assertCanMarkPaid` y `assertCanUnmarkPaid`** hay que leer los métodos actuales (`markAsPaid`, `unmarkAsPaid`) y **transcribir las reglas exactas** que ya enforcean — no inventar. El plan de implementación detallará este paso.

---

## H-17 — `EventSource` se reabre en cada cambio de filtro

**Problema** (`OrdersPanel.tsx:85-96`): `activeFilter` está en las deps del `useEffect` que crea el `EventSource`, así cada cambio de filtro cierra y reabre la conexión SSE. Durante el handshake se pueden perder eventos.

**Fix:**

```tsx
// Sincronizar el filtro en un ref que el callback lee siempre actualizado
const activeFilterRef = useRef<ActiveFilter | null>(null);

useEffect(() => {
  activeFilterRef.current = activeFilter;
}, [activeFilter]);

// EventSource se abre una vez por sesión, sin importar el filtro
useEffect(() => {
  if (status !== ORDERS_STATUS.OPEN || !session) return;
  const token = getAccessToken();
  if (!token) return;
  const es = new EventSource(`${config.apiUrl}/v1/events/dashboard?token=${token}`);
  const reload = () => {
    if (!activeFilterRef.current) fetchOrders(null);
  };
  es.addEventListener(ORDER_EVENTS.NEW, reload);
  es.addEventListener(ORDER_EVENTS.UPDATED, reload);
  return () => es.close();
}, [status, session]);  // ← activeFilter fuera de deps
```

**Tests:**
- Si existe suite del componente con Testing Library: mockear `EventSource`, cambiar filtros varias veces, asertar que el constructor de `EventSource` se llamó **1 sola vez** por mount.
- QA manual: DevTools → Network → filtrar por `eventsource`, aplicar 5 filtros distintos, verificar que la conexión `events/dashboard` queda abierta (status `pending`).

**Nota:** el patrón "evento SSE → refetch completo" sigue vigente después del fix. Eso es H-AUX-02 (separado).

---

## H-18 — Doble submit posible en `OrderCard`

**Problema:** las mutaciones de orden (`confirmOrder`, `updateOrderStatus`, `markOrderPaid`, `unmarkOrderPaid`, `cancelOrder`) no deshabilitan los botones durante el request. Click rápido → 2 PATCH en paralelo. Con la optimistic concurrency ya implementada en backend (H-05, H-13), el segundo request falla con `InvalidStatusTransition` y el usuario ve un toast de error sin causa visible.

**Fix:**

En `OrdersPanel.tsx`:

```tsx
const [inFlight, setInFlight] = useState<Set<string>>(new Set());

async function withInFlight<T>(id: string, fn: () => Promise<T | void>): Promise<T | void> {
  if (inFlight.has(id)) return;
  setInFlight((s) => new Set(s).add(id));
  try {
    return await fn();
  } finally {
    setInFlight((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }
}

async function handleConfirm(id: string) {
  await withInFlight(id, async () => {
    if (!session) return;
    const result = await confirmOrder(id);
    if (!result.ok) { showToast(...); return; }
    showToast('Pedido confirmado');
    await fetchOrders(activeFilter);
  });
}
// Mismo wrapping para handleAdvance, handlePay, handleUnpay, handleCancelConfirm.
```

En `cardCallbacks` se agrega:
```tsx
const cardCallbacks = {
  // ... existentes
  inFlightIds: inFlight,
};
```

En `OrderCard.tsx`:
- Recibir `inFlightIds: Set<string>` en props.
- Calcular `const isBusy = inFlightIds.has(order.id)`.
- Aplicar `disabled={isBusy}` a cada `<button>` de acción.
- `aria-busy={isBusy}` en el card para a11y.
- Opcional: spinner sutil junto al texto del botón activo. No bloqueante para este spec.

**Tests:**
- Test de componente: simular 2 `userEvent.click` consecutivos sobre "Confirmar" → `confirmOrder` se llamó 1 sola vez. Resolver la promise mockeada → botón vuelve a habilitarse.
- QA manual: doble click rápido sobre "Confirmar" en un pedido CREATED, verificar en Network que solo sale 1 PATCH.

---

## Plan de testing global

### Comandos (dentro de Docker, per CLAUDE.md)

```bash
# Unit (backend)
docker compose exec res-api-core pnpm test

# E2E (backend)
docker compose exec res-api-core pnpm test:e2e

# Frontend (si hay suite con Vitest/Jest)
docker compose exec res-ui pnpm test
```

### QA manual (golden path)

| # | Hallazgo | Pasos | Esperado |
|---|----------|-------|----------|
| 1 | H-17 | `/dash/orders` → DevTools Network → filtrar 5 veces | conexión `events/dashboard` se mantiene abierta |
| 2 | H-18 | Doble-click rápido en "Confirmar" un pedido CREATED | 1 solo PATCH en Network; toast "Pedido confirmado" |
| 3 | H-16 (kitchen) | DevTools: `fetch('/v1/kitchen/.../status', { method: 'PATCH', body: JSON.stringify({ status: 'SERVED' }) })` sobre pedido CONFIRMED | 400 `InvalidStatusTransition` |
| 4 | H-16 (cashier) | DevTools: PATCH a `/v1/orders/:id/status` con `{ status: 'COMPLETED' }` sobre pedido en PROCESSING | 400 `InvalidStatusTransition` |
| 5 | H-10 | Cerrar turno desde el dashboard | En BD, `cashShift.closedById = user.id` (non-null) |

---

## Actualización de documentación (parte del DoD)

El work no se considera terminado hasta que:

- **`apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`**:
  - H-10, H-16, H-17, H-18, H-20 marcados `✅ Implementado (fecha)` con resumen de cambios y ruta al plan asociado.
  - H-19 marcado `❌ Descartado` con justificación.
  - Resumen ejecutivo y cuadro "Orden sugerido de remediación" actualizados.
- **`apps/api-core/src/orders/orders.module.info.md`**:
  - Sección nueva (o actualización de la existente) que documenta `OrderStateMachine`, la matriz de transiciones por actor, y la convención de "una sola fuente de verdad".
  - Refrescar cualquier referencia a `STATUS_ORDER` para que apunte a `order-state-machine.ts`.
- **`apps/api-core/src/cash-register/cash-register.module.info.md`**:
  - Anotar que `closeSession` requiere `closedBy` y la razón (auditoría financiera).
- **`apps/api-core/src/kitchen/kitchen.module.info.md`**:
  - Refrescar la sección de transiciones para apuntar a `OrderStateMachine.KITCHEN_ALLOWED_TARGETS` como fuente.

---

## Orden de implementación sugerido

1. **H-19** (doc-only, sin riesgo).
2. **H-10** (1 línea + JSDoc, sin riesgo).
3. **H-20** (comentarios, sin cambio de comportamiento).
4. **H-16** (refactor — el más sustancial; PR separado idealmente).
5. **H-17** (frontend independiente).
6. **H-18** (frontend, usa la base modificada por H-17 — orden flexible).

Backend (1-4) y frontend (5-6) son completamente independientes. Pueden ir en commits/PRs separados o en paralelo si se despachan subagentes.

---

## Fuera de scope (referencias para tracking)

| Hallazgo | Estado | Notas |
|----------|--------|-------|
| H-04 | ⏳ Deferred | Requiere diseño separado del mecanismo `sse-ticket`. |
| H-AUX-02 | ⏳ Pendiente | Documentado en audit doc. Requiere coordinación backend (cambio de contrato SSE) + frontend (dashboard + cocina). |
| `cancelOrder` sin optimistic concurrency | No trackeado | Abrir como hallazgo nuevo en audit antes de atacarlo. Surfaceado durante implementación de H-13. |
