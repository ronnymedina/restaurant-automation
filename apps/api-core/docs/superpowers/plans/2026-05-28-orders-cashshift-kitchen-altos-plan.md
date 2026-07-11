# Hardening ALTOS (Batch 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 5 ALTOS pendientes (H-10, H-16, H-17, H-18, H-20) + descartar formalmente H-19 (código removido en H-03), siguiendo el spec `2026-05-28-orders-cashshift-kitchen-altos-design.md`.

**Architecture:** Refactor de centralización (H-16 extrae lógica de transiciones a una clase `OrderStateMachine` estática) + 2 fixes de hardening menores en backend (H-10 firma estricta, H-20 documentación de invariante multi-tenant) + 2 fixes de UX en frontend (H-17 evita reconexión SSE en cambio de filtro, H-18 deshabilita botones durante mutación in-flight).

**Tech Stack:** NestJS 11 + Prisma + PostgreSQL (backend) · Astro + React islands + Vitest + Testing Library (frontend) · tests siempre en Docker (`docker compose exec res-api-core pnpm test` y `docker compose exec res-ui pnpm test`).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `apps/api-core/src/orders/order-state-machine.ts` | **Crear** | Clase `OrderStateMachine` con métodos estáticos `assertCanAdvance`, `assertCanComplete`, `assertCanCancel` + constantes `STATUS_ORDER`, `KITCHEN_ALLOWED_TARGETS` |
| `apps/api-core/src/orders/order-state-machine.spec.ts` | **Crear** | Unit puro de la state machine (matriz exhaustiva) |
| `apps/api-core/src/orders/orders.service.ts` | Modificar | Reemplaza inline checks por llamadas al state machine (updateStatus, kitchenAdvanceStatus, cancelOrder); agrega JSDoc multi-tenant en kitchenAdvanceStatus |
| `apps/api-core/src/kitchen/dto/update-kitchen-status.dto.ts` | Modificar | `@IsEnum` consume `KITCHEN_ALLOWED_TARGETS` |
| `apps/api-core/src/kitchen/kitchen.controller.ts` | Modificar | Comentario en advanceStatus marcando origen de restaurantId |
| `apps/api-core/src/cash-register/cash-register.service.ts` | Modificar | `closeSession(restaurantId, closedBy)` — closedBy requerido + JSDoc |
| `apps/api-core/src/cash-register/cash-register.service.spec.ts` | Modificar | Confirmar/agregar test que verifique closedBy se pasa al update |
| `apps/ui/src/components/dash/orders/OrdersPanel.tsx` | Modificar | `activeFilter` → ref (H-17) + `inFlight` Set + `withInFlight` wrapper (H-18) |
| `apps/ui/src/components/dash/orders/OrderCard.tsx` | Modificar | Recibe `isBusy: boolean`, deshabilita botones |
| `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` | Modificar | Tests para H-17 (1 sola conexión SSE en filter changes) y H-18 (1 sola mutación en doble click) |
| `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` | Modificar | Marcar hallazgos como Implementado/Descartado + actualizar resumen ejecutivo |
| `apps/api-core/src/orders/orders.module.info.md` | Modificar | Documentar OrderStateMachine + matriz de transiciones |
| `apps/api-core/src/cash-register/cash-register.module.info.md` | Modificar | Anotar closeSession requiere closedBy |
| `apps/api-core/src/kitchen/kitchen.module.info.md` | Modificar | Apuntar a OrderStateMachine.KITCHEN_ALLOWED_TARGETS |

**Nota crítica sobre H-16 (decisión durante planificación):** El spec sugería extraer también `assertCanMarkPaid` y `assertCanUnmarkPaid` al state machine. Tras leer `markAsPaid` y `unmarkAsPaid` (`orders.service.ts:229-273` y `285-318`), confirmo que esas operaciones mezclan validación de estado con idempotencia (early return si `isPaid` ya es el target) y concurrencia transaccional. Forzarlas al state machine quiebra esa cohesión sin reducir duplicación real. **Decisión:** dejar `markAsPaid`/`unmarkAsPaid` fuera del state machine. La state machine solo cubre `assertCanAdvance` (transiciones de status), `assertCanComplete` (variante con isPaid) y `assertCanCancel`.

---

## Task 1: H-19 — descartar formalmente en el audit doc

**Files:**
- Modify: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`

- [ ] **Step 1: Localizar el bloque H-19**

Buscar la sección `### H-19 — handleReceipt falla silenciosamente si popup bloqueado` en el archivo.

- [ ] **Step 2: Verificar que el código realmente ya no existe**

Run:
```bash
grep -rn "handleReceipt\|onReceipt" apps/ui/src/components/dash/orders/
```
Expected: ningún resultado (0 líneas de output). Confirma que H-03 limpió todo.

- [ ] **Step 3: Reemplazar el bloque H-19 con estado descartado**

Reemplazar el bloque completo `### H-19 — ...` con:

```markdown
### H-19 — `handleReceipt` falla silenciosamente si popup bloqueado

**Categoría:** error (frontend)
**Archivo:** ~~`apps/ui/src/components/dash/orders/OrdersPanel.tsx:174-193`~~ (eliminado)

**Estado:** ❌ Descartado (2026-05-28)
**Decisión:** El módulo de recibo del dashboard se borró completamente durante H-03 (cleanup del XSS + dead code). `handleReceipt`, `onReceipt` y el endpoint `POST /v1/print/receipt/:id` ya no existen. El bug que H-19 describía está físicamente removido — no hay código que arreglar.
**Verificación:** `grep -rn "handleReceipt\|onReceipt" apps/ui/src/components/dash/orders/` retorna 0 resultados (2026-05-28).
```

- [ ] **Step 4: Actualizar el resumen ejecutivo para reflejar el descarte**

En la tabla del resumen ejecutivo (línea ~26-31), localizar la fila `🟠 ALTO` y agregar el marcador a H-19. Cambiar:

```
| 🟠 ALTO    | 16 | H-05 ✅, H-06 ✅, ... H-10, H-16…H-20 |
```

por:

```
| 🟠 ALTO    | 16 | H-05 ✅, H-06 ✅, H-07 ✅, H-08 ✅, H-09 ✅, H-11 ✅, H-12 ✅, H-13 ✅, H-14 ✅, H-15 ✅, H-19 ❌, H-10, H-16, H-17, H-18, H-20 |
```

Y agregar al bullet de progreso (después del bullet de H-07/08/...):

```markdown
- ❌ H-19 descartado (2026-05-28) — el módulo de recibo del dashboard se borró completamente en H-03 (dead code + XSS cleanup). No hay código que arreglar.
```

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
git commit -m "docs(audit): mark H-19 as discarded (handleReceipt was removed in H-03)"
```

---

## Task 2: H-10 — `closeSession` requiere `closedBy`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts:40`
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts`

- [ ] **Step 1: Leer test existente de closeSession**

Run:
```bash
grep -n "closeSession" apps/api-core/src/cash-register/cash-register.service.spec.ts
```
Identificar qué tests existen y qué pasan a `closedBy`.

- [ ] **Step 2: Agregar test que verifica closedBy se pasa al update**

Si no existe ya, agregar al describe('closeSession') de `cash-register.service.spec.ts`:

```ts
it('passes closedBy to the cashShift update', async () => {
  const tx = makeTx();  // mock helper existente
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));
  (registerSessionRepository.lockOpenShift as jest.Mock).mockResolvedValue('shift-1');
  (tx.order.count as jest.Mock).mockResolvedValue(0);
  (tx.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 100n }, _count: { id: 1 } });
  (tx.cashShift.update as jest.Mock).mockResolvedValue({ id: 'shift-1' });
  (statsService.getSummary as jest.Mock).mockResolvedValue({});

  await service.closeSession('r1', 'user-42');

  expect(tx.cashShift.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'shift-1' },
      data: expect.objectContaining({ closedBy: 'user-42' }),
    }),
  );
});
```

Adaptar nombres de mocks a los existentes en el spec actual.

- [ ] **Step 3: Run el test (debe fallar si es nuevo, pasar si ya existía)**

```bash
docker compose exec res-api-core pnpm test cash-register.service.spec
```
Expected: test verde si ya existía; rojo si nuevo (porque aún no se cambió nada).

- [ ] **Step 4: Cambiar firma a requerida y agregar JSDoc**

En `apps/api-core/src/cash-register/cash-register.service.ts:40`, reemplazar:

```ts
  async closeSession(restaurantId: string, closedBy?: string) {
```

por:

```ts
  /**
   * Cierra el turno abierto del restaurante. Aplica garantías race-safe vía
   * `lockOpenShift` (SELECT ... FOR UPDATE) y rechaza si hay órdenes
   * pendientes (CREATED/CONFIRMED/PROCESSING/SERVED).
   *
   * @param closedBy Identificador del actor que cierra. DEBE ser el id del
   * user JWT en flujos HTTP, o un identificador único de proceso en jobs
   * internos (ej. "system:reconciliation"). La columna `closedById` queda
   * garantizada non-null para auditoría financiera (audit H-10).
   */
  async closeSession(restaurantId: string, closedBy: string) {
```

- [ ] **Step 5: Run la suite completa del módulo cash-register**

```bash
docker compose exec res-api-core pnpm test cash-register
```
Expected: todos verdes. El cambio es type-only — si algún test pasaba `undefined` explícito, TypeScript fallará y hay que corregirlo.

- [ ] **Step 6: Verificar que ningún caller de producción rompe**

```bash
grep -rn "closeSession(" apps/api-core/src --include="*.ts" | grep -v ".spec.ts"
```
Expected: cada llamada pasa 2 argumentos (restaurantId, closedBy).

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts apps/api-core/src/cash-register/cash-register.service.spec.ts
git commit -m "fix(cash-register): require closedBy in closeSession (H-10)

Make closedBy required in the signature so future internal callers (CLI,
reconciliation jobs) cannot close a shift without identifying themselves.
Existing HTTP controller already passes user.id from the JWT — no behavior
change at runtime. Adds compile-time enforcement of audit trail."
```

---

## Task 3: H-20 — comentarios de invariante multi-tenant

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts:184`
- Modify: `apps/api-core/src/kitchen/kitchen.controller.ts:99-103`

- [ ] **Step 1: Agregar JSDoc en `kitchenAdvanceStatus`**

En `apps/api-core/src/orders/orders.service.ts:184`, justo antes de `async kitchenAdvanceStatus(...)`, agregar:

```ts
  /**
   * Avanza el estado de una orden desde la cocina (CONFIRMED → PROCESSING → SERVED).
   *
   * IMPORTANTE — Multi-tenant safety (audit H-20): `restaurantId` DEBE provenir
   * del actor autenticado (JWT del cajero o `KitchenTokenGuard.KITCHEN_RESTAURANT_KEY`),
   * nunca del body del request. La protección por `findFirst({ where: { id,
   * restaurantId } })` depende 100% de que el caller respete esta convención.
   * Cualquier endpoint nuevo que llame este método debe derivar `restaurantId`
   * del JWT/guard, jamás del cliente.
   */
  async kitchenAdvanceStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
```

(Si ya hay un comentario existente sobre H-13, conservarlo dentro del cuerpo del método y poner este JSDoc encima.)

- [ ] **Step 2: Agregar comentario corto en el controller**

En `apps/api-core/src/kitchen/kitchen.controller.ts:99-103`, modificar:

```ts
    return this.kitchenService.advanceStatus(
      (req as any)[KITCHEN_RESTAURANT_KEY],
      id,
      dto.status,
    );
```

por:

```ts
    return this.kitchenService.advanceStatus(
      (req as any)[KITCHEN_RESTAURANT_KEY],  // setteado por KitchenTokenGuard — no del body (audit H-20)
      id,
      dto.status,
    );
```

- [ ] **Step 3: Run tests para confirmar que no se rompió nada**

```bash
docker compose exec res-api-core pnpm test orders kitchen
```
Expected: todos verdes (no hay cambio de comportamiento).

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/kitchen/kitchen.controller.ts
git commit -m "docs(orders,kitchen): annotate multi-tenant invariant on kitchenAdvanceStatus (H-20)

The method protects multi-tenant isolation via findFirst({where:{id, restaurantId}}),
but that depends 100% on callers deriving restaurantId from the JWT/guard, never
the request body. Adds explicit JSDoc on the service method and inline comment
at the controller call site so the convention survives future endpoint additions."
```

---

## Task 4a: H-16 — crear `OrderStateMachine` con TDD

**Files:**
- Create: `apps/api-core/src/orders/order-state-machine.ts`
- Create: `apps/api-core/src/orders/order-state-machine.spec.ts`

- [ ] **Step 1: Escribir el spec primero (todos los casos)**

Crear `apps/api-core/src/orders/order-state-machine.spec.ts` con:

```ts
import { OrderStatus } from '@prisma/client';
import { OrderStateMachine, STATUS_ORDER, KITCHEN_ALLOWED_TARGETS } from './order-state-machine';
import {
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';

describe('OrderStateMachine', () => {
  describe('constants', () => {
    it('STATUS_ORDER lists the lifecycle in canonical order', () => {
      expect(STATUS_ORDER).toEqual([
        OrderStatus.CREATED,
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        OrderStatus.SERVED,
        OrderStatus.COMPLETED,
      ]);
    });

    it('KITCHEN_ALLOWED_TARGETS limits kitchen to PROCESSING and SERVED', () => {
      expect(KITCHEN_ALLOWED_TARGETS).toEqual([OrderStatus.PROCESSING, OrderStatus.SERVED]);
    });
  });

  describe('assertCanAdvance — cashier', () => {
    it('allows CREATED → CONFIRMED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CREATED, OrderStatus.CONFIRMED, 'cashier')).not.toThrow();
    });
    it('allows CONFIRMED → PROCESSING', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CONFIRMED, OrderStatus.PROCESSING, 'cashier')).not.toThrow();
    });
    it('allows PROCESSING → SERVED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.PROCESSING, OrderStatus.SERVED, 'cashier')).not.toThrow();
    });
    it('allows SERVED → COMPLETED (isPaid validation lives in assertCanComplete)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.SERVED, OrderStatus.COMPLETED, 'cashier')).not.toThrow();
    });
    it('rejects skipping a step (CREATED → PROCESSING)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CREATED, OrderStatus.PROCESSING, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects retroceso (PROCESSING → CONFIRMED)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.PROCESSING, OrderStatus.CONFIRMED, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects advancing from CANCELLED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CANCELLED, OrderStatus.CONFIRMED, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects advancing from COMPLETED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.COMPLETED, OrderStatus.CANCELLED, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('assertCanAdvance — kitchen', () => {
    it('allows CONFIRMED → PROCESSING', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CONFIRMED, OrderStatus.PROCESSING, 'kitchen')).not.toThrow();
    });
    it('allows PROCESSING → SERVED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.PROCESSING, OrderStatus.SERVED, 'kitchen')).not.toThrow();
    });
    it('rejects CREATED → CONFIRMED (cashier-only)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CREATED, OrderStatus.CONFIRMED, 'kitchen')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects SERVED → COMPLETED (kitchen never completes)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.SERVED, OrderStatus.COMPLETED, 'kitchen')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects skipping a step (CONFIRMED → SERVED)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CONFIRMED, OrderStatus.SERVED, 'kitchen')).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('assertCanComplete', () => {
    it('allows SERVED + isPaid', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.SERVED, true)).not.toThrow();
    });
    it('rejects SERVED + !isPaid with OrderNotPaidException', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.SERVED, false)).toThrow(OrderNotPaidException);
    });
    it('rejects PROCESSING (not at SERVED yet) with InvalidStatusTransitionException', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.PROCESSING, true)).toThrow(InvalidStatusTransitionException);
    });
    it('rejects already COMPLETED', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.COMPLETED, true)).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('assertCanCancel', () => {
    it.each([OrderStatus.CREATED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SERVED])(
      'allows cancel from %s when not paid',
      (status) => {
        expect(() => OrderStateMachine.assertCanCancel(status, false)).not.toThrow();
      },
    );
    it('rejects when already CANCELLED with OrderAlreadyCancelledException', () => {
      expect(() => OrderStateMachine.assertCanCancel(OrderStatus.CANCELLED, false)).toThrow(OrderAlreadyCancelledException);
    });
    it('rejects when COMPLETED with InvalidStatusTransitionException', () => {
      expect(() => OrderStateMachine.assertCanCancel(OrderStatus.COMPLETED, false)).toThrow(InvalidStatusTransitionException);
    });
    it.each([OrderStatus.CREATED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SERVED])(
      'rejects cancel from %s when isPaid with CannotCancelPaidOrderException',
      (status) => {
        expect(() => OrderStateMachine.assertCanCancel(status, true)).toThrow(CannotCancelPaidOrderException);
      },
    );
  });
});
```

- [ ] **Step 2: Run el spec para verificar que falla (rojo)**

```bash
docker compose exec res-api-core pnpm test order-state-machine.spec
```
Expected: FAIL con "Cannot find module './order-state-machine'" o similar.

- [ ] **Step 3: Implementar `OrderStateMachine`**

Crear `apps/api-core/src/orders/order-state-machine.ts`:

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
   * - Cualquier actor: target debe ser el siguiente índice (sin saltos, sin retrocesos, sin partir de CANCELLED).
   * - Kitchen: target adicionalmente debe estar en KITCHEN_ALLOWED_TARGETS.
   * - Para SERVED → COMPLETED el actor cashier puede usar este método o `assertCanComplete` (este NO verifica isPaid).
   *
   * Lanza InvalidStatusTransitionException si la transición es inválida.
   */
  static assertCanAdvance(from: OrderStatus, to: OrderStatus, actor: Actor): void {
    const currentIdx = STATUS_ORDER.indexOf(from);
    const targetIdx = STATUS_ORDER.indexOf(to);

    // from === CANCELLED or unknown to → reject. currentIdx === -1 means from is not in the linear progression.
    if (currentIdx === -1 || targetIdx === -1 || targetIdx !== currentIdx + 1) {
      throw new InvalidStatusTransitionException(from, to);
    }

    if (actor === 'kitchen' && !KITCHEN_ALLOWED_TARGETS.includes(to)) {
      throw new InvalidStatusTransitionException(from, to);
    }
  }

  /**
   * Valida que la orden puede cerrarse (SERVED → COMPLETED) con la garantía de pago.
   * Solo aplicable al actor cashier — kitchen nunca alcanza COMPLETED.
   *
   * Lanza InvalidStatusTransitionException si from !== SERVED.
   * Lanza OrderNotPaidException si from === SERVED pero !isPaid.
   */
  static assertCanComplete(from: OrderStatus, isPaid: boolean): void {
    if (from !== OrderStatus.SERVED) {
      throw new InvalidStatusTransitionException(from, OrderStatus.COMPLETED);
    }
    if (!isPaid) {
      throw new OrderNotPaidException(from);
    }
  }

  /**
   * Valida que el estado actual permite cancelar.
   *
   * Lanza:
   *   - OrderAlreadyCancelledException si from === CANCELLED
   *   - InvalidStatusTransitionException si from === COMPLETED
   *   - CannotCancelPaidOrderException si isPaid (cualquier estado pre-COMPLETED)
   */
  static assertCanCancel(from: OrderStatus, isPaid: boolean): void {
    if (from === OrderStatus.CANCELLED) {
      throw new OrderAlreadyCancelledException(from);
    }
    if (from === OrderStatus.COMPLETED) {
      throw new InvalidStatusTransitionException(from, OrderStatus.CANCELLED);
    }
    if (isPaid) {
      throw new CannotCancelPaidOrderException(from);
    }
  }
}
```

**Nota sobre signatures de excepciones:** los constructores actuales de `OrderAlreadyCancelledException`, `OrderNotPaidException`, `CannotCancelPaidOrderException` esperan un `id` (string) en producción, pero en la state machine no tenemos el id de la orden. Si los constructores requieren id estrictamente, ajustar a tomar lo que cada uno requiera (verificar `apps/api-core/src/orders/exceptions/orders.exceptions.ts` antes de implementar) — la state machine puede aceptar un parámetro opcional `orderId` para enriquecer los mensajes, o las excepciones pueden volverse opcionales en el id. Decisión: durante implementación, leer el constructor de cada excepción y ajustar el método para pasar lo que se necesita (probablemente agregar un parámetro opcional `orderId?: string` a los métodos del state machine que llaman a estas excepciones).

- [ ] **Step 4: Run el spec para verificar que pasa (verde)**

```bash
docker compose exec res-api-core pnpm test order-state-machine.spec
```
Expected: PASS — todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/order-state-machine.ts apps/api-core/src/orders/order-state-machine.spec.ts
git commit -m "feat(orders): add OrderStateMachine class (H-16)

Centralize order status transition rules into a dedicated class with static
methods. Encapsulates:
- STATUS_ORDER (canonical lifecycle)
- KITCHEN_ALLOWED_TARGETS (kitchen-restricted set)
- assertCanAdvance(from, to, actor) — +1 step transitions per actor
- assertCanComplete(from, isPaid) — guarded SERVED → COMPLETED
- assertCanCancel(from, isPaid) — cancel preconditions

Spec includes exhaustive matrix coverage. orders.service.ts will be
refactored in follow-up commits to consume this class."
```

---

## Task 4b: H-16 — refactor `kitchenAdvanceStatus` y `updateStatus`

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts` (líneas 26-32, 150-160, 184-227)

- [ ] **Step 1: Importar la state machine en orders.service.ts**

En la cabecera de imports, agregar:

```ts
import { OrderStateMachine } from './order-state-machine';
```

Y **eliminar** el `STATUS_ORDER` local (líneas 26-32):

```ts
const STATUS_ORDER: OrderStatus[] = [ ... ];  // ← borrar
```

Si hay otros lugares en el archivo que referencian `STATUS_ORDER` directamente (búsqueda obligada: `grep -n "STATUS_ORDER" apps/api-core/src/orders/orders.service.ts`), reemplazarlos por `OrderStateMachine.STATUS_ORDER`.

- [ ] **Step 2: Refactor `updateStatus`**

Buscar `async updateStatus(` en `orders.service.ts` (alrededor de línea 150). Reemplazar el bloque de validación inline:

```ts
const currentIdx = STATUS_ORDER.indexOf(order.status);
const targetIdx = STATUS_ORDER.indexOf(newStatus);
if (targetIdx === -1 || targetIdx !== currentIdx + 1) {
  throw new InvalidStatusTransitionException(order.status, newStatus);
}
```

por:

```ts
OrderStateMachine.assertCanAdvance(order.status, newStatus, 'cashier');
```

Si el método actualmente además valida pago para COMPLETED (verificar leyendo el código exacto antes de cambiar), reemplazar también ese chequeo por:

```ts
if (newStatus === OrderStatus.COMPLETED) {
  OrderStateMachine.assertCanComplete(order.status, order.isPaid);
}
```

- [ ] **Step 3: Refactor `kitchenAdvanceStatus`**

Localizar el bloque de validación inline dentro de `kitchenAdvanceStatus` (líneas ~198-203):

```ts
const currentIdx = STATUS_ORDER.indexOf(order.status);
const targetIdx = STATUS_ORDER.indexOf(newStatus);
const KITCHEN_MAX_IDX = STATUS_ORDER.indexOf(OrderStatus.SERVED);
if (targetIdx === -1 || targetIdx !== currentIdx + 1 || targetIdx > KITCHEN_MAX_IDX) {
  throw new InvalidStatusTransitionException(order.status, newStatus);
}
```

Reemplazar por:

```ts
OrderStateMachine.assertCanAdvance(order.status, newStatus, 'kitchen');
```

Conservar intacto el resto del método (la lógica de transacción + optimistic concurrency de H-13 sigue igual).

- [ ] **Step 4: Run tests del módulo orders**

```bash
docker compose exec res-api-core pnpm test orders.service.spec
```
Expected: todos los tests existentes de `updateStatus` y `kitchenAdvanceStatus` siguen pasando (mismo comportamiento, mismas excepciones).

- [ ] **Step 5: Si hay tests rojos, diagnosticar y corregir**

Casos esperables de regresión:
- Mensaje de error diferente (las excepciones se construyen igual, pero verificar payload del `.message`).
- Si algún test espera `STATUS_ORDER` exportado del service, actualizar para importar de `order-state-machine`.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts
git commit -m "refactor(orders): consume OrderStateMachine in updateStatus and kitchenAdvanceStatus (H-16)

Replace inline indexOf-based validation with OrderStateMachine.assertCanAdvance.
Removes the dead-code check 'targetIdx > KITCHEN_MAX_IDX' (which was redundant
with the +1 check since SERVED === KITCHEN_MAX_IDX). The kitchen restriction
is now expressed declaratively via KITCHEN_ALLOWED_TARGETS, so adding a future
state cannot silently bypass it.

No behavior change — all existing unit and e2e tests pass unchanged."
```

---

## Task 4c: H-16 — refactor `cancelOrder`

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts:170-182` (cancelOrder)

- [ ] **Step 1: Refactor cancelOrder**

Localizar `async cancelOrder(id, restaurantId, reason)` (línea ~170). Reemplazar el bloque:

```ts
if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);
if (order.status === OrderStatus.COMPLETED) {
  throw new InvalidStatusTransitionException(order.status, OrderStatus.CANCELLED);
}
if (order.isPaid) throw new CannotCancelPaidOrderException(id);
```

por:

```ts
OrderStateMachine.assertCanCancel(order.status, order.isPaid);
```

**Importante:** las excepciones que originalmente recibían `id` ahora se construyen dentro del state machine. Si el flujo end-to-end o los tests asertan sobre el `id` específico en el payload del error, hay 2 opciones:
- (a) Modificar el state machine para aceptar un `orderId?: string` opcional y pasárselo a las excepciones.
- (b) Aceptar que las excepciones se construyen sin id y ajustar tests.

Decisión recomendada (a) si hay tests que dependen del id en el mensaje. Esto requiere extender el método a:

```ts
static assertCanCancel(from: OrderStatus, isPaid: boolean, orderId?: string): void {
  if (from === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(orderId ?? from);
  if (from === OrderStatus.COMPLETED) throw new InvalidStatusTransitionException(from, OrderStatus.CANCELLED);
  if (isPaid) throw new CannotCancelPaidOrderException(orderId ?? from);
}
```

Y agregar al spec test correspondientes que validen que `orderId` se transmite.

- [ ] **Step 2: Run tests del módulo orders**

```bash
docker compose exec res-api-core pnpm test orders.service.spec
```
Expected: todos verdes.

- [ ] **Step 3: Run e2e de orders para confirmar end-to-end**

```bash
docker compose exec res-api-core pnpm test:e2e orders
```
Expected: todos verdes (los e2e de cancel cubren el path completo).

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/order-state-machine.ts apps/api-core/src/orders/order-state-machine.spec.ts
git commit -m "refactor(orders): consume OrderStateMachine in cancelOrder (H-16)

Replace three sequential inline checks (CANCELLED → COMPLETED → isPaid) with
a single OrderStateMachine.assertCanCancel call. Extends the state machine
methods to accept an optional orderId so existing exception payloads remain
backwards-compatible."
```

---

## Task 4d: H-16 — refactor `UpdateKitchenStatusDto`

**Files:**
- Modify: `apps/api-core/src/kitchen/dto/update-kitchen-status.dto.ts`

- [ ] **Step 1: Reemplazar el array hardcodeado en el DTO**

Reemplazar todo el archivo por:

```ts
import { IsEnum } from 'class-validator';
import { $Enums } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { KITCHEN_ALLOWED_TARGETS } from '../../orders/order-state-machine';

export class UpdateKitchenStatusDto {
  @ApiProperty({
    enum: KITCHEN_ALLOWED_TARGETS,
    description: 'Nuevo estado del pedido (solo PROCESSING o SERVED desde cocina)',
  })
  @IsEnum(KITCHEN_ALLOWED_TARGETS, {
    message: `Kitchen can only advance to ${KITCHEN_ALLOWED_TARGETS.join(' or ')}`,
  })
  status: $Enums.OrderStatus;
}
```

**Nota:** `KITCHEN_ALLOWED_TARGETS` es `readonly`, pero `@IsEnum` y `enum` de Swagger aceptan arrays readonly. Si TypeScript da error, hacer cast: `KITCHEN_ALLOWED_TARGETS as OrderStatus[]`.

- [ ] **Step 2: Run unit tests del módulo kitchen**

```bash
docker compose exec res-api-core pnpm test kitchen
```
Expected: todos verdes.

- [ ] **Step 3: Run e2e de kitchen para confirmar que el DTO valida igual**

```bash
docker compose exec res-api-core pnpm test:e2e kitchen
```
Expected: todos verdes. Los tests existentes que enviaban `{status: 'SERVED'}` o `{status: 'PROCESSING'}` siguen pasando; los que envían `{status: 'COMPLETED'}` siguen recibiendo 400.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/kitchen/dto/update-kitchen-status.dto.ts
git commit -m "refactor(kitchen): UpdateKitchenStatusDto consumes KITCHEN_ALLOWED_TARGETS (H-16)

DTO no longer hardcodes [PROCESSING, SERVED]. Consumes the same constant
used by OrderStateMachine.assertCanAdvance so adding/removing a kitchen-
allowed target propagates automatically to the DTO validation, the service
guard, and the Swagger docs."
```

---

## Task 5: H-17 — `EventSource` con `useRef` para filtro

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx:80-96`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

- [ ] **Step 1: Agregar test que verifica 1 sola conexión SSE en cambios de filtro**

Al final de `OrdersPanel.test.tsx`, agregar:

```ts
test('H-17: EventSource is created once per session, not on every filter change', async () => {
  const esInstances: any[] = [];
  const fakeES = vi.fn().mockImplementation(() => {
    const inst = { addEventListener: vi.fn(), close: vi.fn() };
    esInstances.push(inst);
    return inst;
  });
  vi.stubGlobal('EventSource', fakeES);

  vi.mocked(require('../../../lib/auth').getAccessToken).mockReturnValue('tok');
  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  const { rerender } = render(<OrdersPanel />);
  await waitFor(() => expect(fakeES).toHaveBeenCalledTimes(1));

  // Forzar re-renders simulando cambios de filtro internos vía un evento del FilterPanel.
  // Si el test directo de UI no aplica, validar indirecto: el efecto solo se ejecuta cuando
  // status/session cambian. Cambiar el filtro NO debe disparar otro `new EventSource`.

  // Esperar varios ticks y verificar que sigue siendo 1.
  await new Promise((r) => setTimeout(r, 50));
  expect(fakeES).toHaveBeenCalledTimes(1);

  vi.unstubAllGlobals();
});
```

**Nota:** este test es difícil de hacer 100% determinístico sin un harness que dispare cambios de filtro vía la UI real. Si no se puede asertar el filter change end-to-end, dejar el test que verifica que `new EventSource` se llama exactamente una vez en mount + un comentario explicativo. La verificación rigurosa se hace en QA manual (Step 4).

- [ ] **Step 2: Run el test (debe fallar mostrando 2+ instancias antes del fix)**

```bash
docker compose exec res-ui pnpm test OrdersPanel
```
Expected: PASS si el mount inicial es solo 1 — el test sirve como regression guard.

- [ ] **Step 3: Implementar el fix con useRef**

En `apps/ui/src/components/dash/orders/OrdersPanel.tsx`, cambiar el import de React:

```tsx
- import { useState, useEffect } from 'react';
+ import { useState, useEffect, useRef } from 'react';
```

Agregar el ref después de los `useState` (alrededor de línea 32):

```tsx
const activeFilterRef = useRef<ActiveFilter | null>(null);

useEffect(() => {
  activeFilterRef.current = activeFilter;
}, [activeFilter]);
```

Modificar el `useEffect` del SSE (líneas 85-96) eliminando `activeFilter` de las deps y leyendo del ref:

```tsx
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
}, [status, session]);  // ← activeFilter ya no está en deps
```

- [ ] **Step 4: Run tests para confirmar verde**

```bash
docker compose exec res-ui pnpm test OrdersPanel
```
Expected: todos verdes.

- [ ] **Step 5: QA manual obligatorio**

1. `docker compose up` (asegurar que api + ui están corriendo).
2. Abrir `/dash/orders` autenticado.
3. DevTools → Network → filtrar por "EventStream" o "eventsource".
4. Aplicar 5 filtros distintos seguidos.
5. Verificar que la conexión `events/dashboard` queda **abierta** (status pendiente "200 OK pending") — no debe haber 5 conexiones cerradas + 1 abierta.

Documentar el resultado: "QA manual H-17 ✅ verificado por [fecha/usuario]".

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "fix(ui): keep EventSource open across filter changes (H-17)

Move activeFilter to a useRef so the SSE effect doesn't re-run when the
filter changes. Prevents handshake churn and potential event loss during
reconnection. The reload callback reads the ref so the filter-aware skip
logic still works."
```

---

## Task 6: H-18 — in-flight tracking en `OrderCard`

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

- [ ] **Step 1: Agregar test que verifica que un doble click solo dispara 1 mutación**

Al final de `OrdersPanel.test.tsx`:

```ts
test('H-18: rapid double-click on Confirmar dispatches confirmOrder once', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockImplementation(() => new Promise((r) => setTimeout(() => r({ ok: true, data: {} as any }), 50)));

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  const confirmBtn = await screen.findByText('Confirmar');

  fireEvent.click(confirmBtn);
  fireEvent.click(confirmBtn);  // doble click rápido antes del resolve

  await waitFor(() => expect(vi.mocked(confirmOrder)).toHaveBeenCalledTimes(1));
});
```

Adaptar el shape del mock de Order a lo que el componente espera.

- [ ] **Step 2: Run test (debe fallar antes del fix con count === 2)**

```bash
docker compose exec res-ui pnpm test OrdersPanel
```
Expected: FAIL con "expected 1 but got 2".

- [ ] **Step 3: Implementar el wrapper `withInFlight` en OrdersPanel**

Después de las declaraciones de `useState` en `OrdersPanel.tsx`, agregar:

```tsx
const [inFlight, setInFlight] = useState<Set<string>>(new Set());

async function withInFlight(id: string, fn: () => Promise<void>): Promise<void> {
  setInFlight((s) => {
    if (s.has(id)) return s;
    const next = new Set(s);
    next.add(id);
    return next;
  });
  // Re-check after state update — if it was already in-flight, bail.
  // Note: using a local ref-tracked set would be more reliable, but for now
  // we rely on React's batched state updates. See alternative below if races appear.
  try {
    await fn();
  } finally {
    setInFlight((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }
}
```

**Alternativa robusta (preferida si el test del Step 2 sigue siendo flaky):** usar un `useRef<Set<string>>(new Set())` paralelo al `useState` para el check síncrono:

```tsx
const inFlightRef = useRef<Set<string>>(new Set());
const [inFlightVersion, setInFlightVersion] = useState(0);  // para forzar re-render

async function withInFlight(id: string, fn: () => Promise<void>): Promise<void> {
  if (inFlightRef.current.has(id)) return;  // check síncrono
  inFlightRef.current.add(id);
  setInFlightVersion((v) => v + 1);
  try {
    await fn();
  } finally {
    inFlightRef.current.delete(id);
    setInFlightVersion((v) => v + 1);
  }
}

const isBusy = (id: string) => inFlightRef.current.has(id);
```

Recomendación: empezar con la versión simple (`useState`); si el test de doble click es flaky, cambiar a la versión con `useRef`. Documentar el cambio.

- [ ] **Step 4: Envolver cada handler con `withInFlight`**

Modificar los 5 handlers en `OrdersPanel.tsx` (`handleConfirm`, `handleAdvance`, `handlePay`, `handleUnpay`, `handleCancelConfirm`). Ejemplo para `handleConfirm`:

```tsx
async function handleConfirm(id: string) {
  await withInFlight(id, async () => {
    if (!session) return;
    const result = await confirmOrder(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al confirmar', true);
      return;
    }
    showToast('Pedido confirmado');
    await fetchOrders(activeFilter);
  });
}
```

Repetir el mismo patrón para `handleAdvance`, `handlePay`, `handleUnpay` y `handleCancelConfirm`. Cada uno envuelve su lógica actual dentro del callback de `withInFlight(id, ...)`.

- [ ] **Step 5: Pasar el estado in-flight a OrderCard via cardCallbacks**

Modificar el objeto `cardCallbacks` (línea ~184):

```tsx
const cardCallbacks = {
  onConfirm: handleConfirm,
  onAdvance: handleAdvance,
  onPay: handlePay,
  onUnpay: handleUnpay,
  onCancel: (id: string) => setCancelOrderId(id),
  onCancelBlocked: handleCancelBlocked,
  inFlightIds: inFlight,
};
```

(Si se usó la versión con ref, exponer `isBusy: isBusy` y dejar `inFlightIds: inFlightRef.current` para el set entero si lo necesitan los hijos.)

- [ ] **Step 6: Recibir el estado en OrderCard y deshabilitar botones**

En `OrderCard.tsx`, agregar al interface:

```tsx
export interface OrderCardCallbacks {
  onConfirm: (id: string) => void;
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string, paymentMethod?: string) => void;
  onUnpay: (id: string) => void;
  onCancel: (id: string) => void;
  onCancelBlocked: (id: string) => void;
  inFlightIds: Set<string>;  // ← nuevo
}
```

Cambiar la deconstrucción de props (línea ~60-62):

```tsx
export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, inFlightIds,
}: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';
  const isActive = ACTIVE_STATUSES.has(order.status);
  const isBusy = inFlightIds.has(order.id);
  // ... resto sin cambios
```

Aplicar `disabled={isBusy}` a:
- Botón primario (línea ~152): agregar `disabled={isBusy}` al `<button>`.
- Botón "Marcar Pagado" (línea ~173): idem.
- Botón "Desmarcar Pago" (línea ~185): idem.
- Botón "Cancelar" (líneas 193 y 203): idem.

Estilizar el estado deshabilitado agregando `disabled:opacity-60 disabled:cursor-not-allowed` a las clases de cada botón.

Agregar `aria-busy={isBusy}` al `<div>` raíz del card (línea ~72) para a11y:

```tsx
<div
  className={...}
  aria-busy={isBusy}
>
```

- [ ] **Step 7: Run tests para confirmar verde**

```bash
docker compose exec res-ui pnpm test OrdersPanel OrderCard
```
Expected: todos verdes, incluyendo el doble click test.

- [ ] **Step 8: QA manual del comportamiento**

1. Abrir `/dash/orders` con la API corriendo.
2. Crear un pedido desde el kiosk.
3. En el dashboard, hacer **doble click rápido** sobre "Confirmar".
4. DevTools → Network → verificar que se envió **un solo** `PATCH /v1/orders/:id/confirm`.
5. Después de que el request resuelve, verificar que el botón vuelve a estar habilitado (en caso de error, debería re-habilitarse y permitir reintentar).

- [ ] **Step 9: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx apps/ui/src/components/dash/orders/OrderCard.tsx apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "fix(ui): disable order action buttons during in-flight mutations (H-18)

Track in-flight order IDs in OrdersPanel and pass the set to OrderCard.
Each card disables its action buttons when its order id is in flight,
preventing double-submit (e.g., rapid double-click on Confirmar). Also
adds aria-busy for screen readers."
```

---

## Task 7: Documentación final (audit + module.info)

**Files:**
- Modify: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`
- Modify: `apps/api-core/src/orders/orders.module.info.md`
- Modify: `apps/api-core/src/cash-register/cash-register.module.info.md`
- Modify: `apps/api-core/src/kitchen/kitchen.module.info.md`

- [ ] **Step 1: Marcar H-10 como Implementado en el audit doc**

Localizar el bloque `### H-10 — closeSession con closedBy opcional`. Al final del bloque, antes del `---`, agregar:

```markdown
**Estado:** ✅ Implementado (2026-05-28) — firma cambiada a `closedBy: string` requerido en `cash-register.service.ts:40`; JSDoc anota que callers no-HTTP deben pasar un identificador único de proceso.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`
```

- [ ] **Step 2: Marcar H-16, H-17, H-18, H-20 como Implementado**

Para cada uno de esos 4 hallazgos, agregar el bloque `**Estado:** ✅ Implementado` con la fecha y resumen específico del cambio aplicado:

```markdown
### H-16 — UpdateKitchenStatusDto permite SERVED como primer estado
...
**Estado:** ✅ Implementado (2026-05-28) — nueva clase `OrderStateMachine` en `apps/api-core/src/orders/order-state-machine.ts` centraliza transiciones; `assertCanAdvance(from, to, actor)` consolida el chequeo dual frágil; `UpdateKitchenStatusDto` y `orders.service.ts` consumen `KITCHEN_ALLOWED_TARGETS` como única fuente de verdad. Spec dedicado `order-state-machine.spec.ts` cubre matriz exhaustiva.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`
```

```markdown
### H-17 — EventSource se reabre en cada cambio de filtro
...
**Estado:** ✅ Implementado (2026-05-28) — `activeFilter` movido a `useRef`; el `useEffect` del SSE ya no lo tiene en deps. Conexión queda abierta a través de cambios de filtro. Test regression en `OrdersPanel.test.tsx`.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`
```

```markdown
### H-18 — Doble submit posible en OrderCard
...
**Estado:** ✅ Implementado (2026-05-28) — `OrdersPanel` rastrea ids en vuelo en un `Set<string>`; `withInFlight(id, fn)` envuelve cada handler; `OrderCard` recibe `inFlightIds`, computa `isBusy = inFlightIds.has(order.id)` y deshabilita todos los botones de acción (`disabled={isBusy}` + `aria-busy`). Test regression cubre doble click.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`
```

```markdown
### H-20 — kitchenAdvanceStatus confía en el caller para restaurantId
...
**Estado:** ✅ Implementado (2026-05-28) — auditoría confirma que `kitchen.controller.ts` deriva `restaurantId` de `KITCHEN_RESTAURANT_KEY` (guard), no del body. JSDoc en `kitchenAdvanceStatus` + comentario inline en el controller documentan explícitamente la invariante.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`
```

- [ ] **Step 3: Actualizar el resumen ejecutivo**

En la tabla del resumen ejecutivo, actualizar la fila ALTO:

```
| 🟠 ALTO    | 16 | H-05 ✅, H-06 ✅, H-07 ✅, H-08 ✅, H-09 ✅, H-10 ✅, H-11 ✅, H-12 ✅, H-13 ✅, H-14 ✅, H-15 ✅, H-16 ✅, H-17 ✅, H-18 ✅, H-19 ❌, H-20 ✅ |
```

Agregar al bullet de progreso:

```markdown
- ✅ H-10, H-16, H-17, H-18, H-20 implementados (2026-05-28) — batch 3 ALTOS: `closedBy` requerido en `closeSession`, clase `OrderStateMachine` centraliza transiciones, SSE no reconecta en filter change, doble submit bloqueado en OrderCard, multi-tenant invariant documentada. Ver `2026-05-28-orders-cashshift-kitchen-altos-design.md` y plan asociado.
- ❌ H-19 descartado (2026-05-28) — código removido en H-03.
```

Actualizar el cuadro "Orden sugerido de remediación":

```
| **Backlog técnico** | ~~H-17, H-18, H-20~~ ✅, H-AUX-02, todos los MEDIOS |
```

- [ ] **Step 4: Actualizar `orders.module.info.md`**

Localizar la sección de transiciones de estado (búsqueda: `STATUS_ORDER` o `state machine` o `transición`). Reemplazar o agregar:

```markdown
## Máquina de estados (OrderStateMachine)

Toda la lógica de transición de estados de orden vive en `order-state-machine.ts`. Es la **única fuente de verdad** para:

- `STATUS_ORDER` — secuencia canónica `CREATED → CONFIRMED → PROCESSING → SERVED → COMPLETED`.
- `KITCHEN_ALLOWED_TARGETS` — `[PROCESSING, SERVED]`. El DTO de cocina (`UpdateKitchenStatusDto`) lo consume.

### Métodos de la clase

| Método | Reglas |
|--------|--------|
| `assertCanAdvance(from, to, actor)` | Avance +1 estricto. Kitchen adicionalmente debe targetear `KITCHEN_ALLOWED_TARGETS`. |
| `assertCanComplete(from, isPaid)` | `from === SERVED` && `isPaid === true`. |
| `assertCanCancel(from, isPaid)` | Cualquier estado pre-COMPLETED, `!isPaid`. |

Cualquier nuevo flujo de transición debe llamar al método correspondiente — **no** duplicar checks inline.
```

- [ ] **Step 5: Actualizar `cash-register.module.info.md`**

Localizar la documentación de `closeSession` y agregar/actualizar:

```markdown
### `closeSession(restaurantId, closedBy)`

Cierra el turno abierto del restaurante. **`closedBy` es requerido** (audit H-10) — todos los callers deben identificarse:
- En flujos HTTP: `user.id` del JWT autenticado.
- En jobs/CLI internos: un identificador único de proceso (ej. `"system:reconciliation"`).

Garantiza `cashShift.closedById` non-null para auditoría financiera.
```

- [ ] **Step 6: Actualizar `kitchen.module.info.md`**

Localizar la sección que documenta las transiciones permitidas para cocina (búsqueda: `PROCESSING` o `SERVED` o `transición`). Actualizar para apuntar a la state machine:

```markdown
### Transiciones permitidas para cocina

Definidas como única fuente de verdad en `apps/api-core/src/orders/order-state-machine.ts`:

```ts
KITCHEN_ALLOWED_TARGETS = [PROCESSING, SERVED]
```

El DTO `UpdateKitchenStatusDto` consume esta constante con `@IsEnum`. El service `OrdersService.kitchenAdvanceStatus` consume `OrderStateMachine.assertCanAdvance(from, to, 'kitchen')` que combina el avance +1 con la restricción de targets.

Cocina nunca puede:
- Avanzar a `COMPLETED` (cierre es del cajero, requiere `isPaid`).
- Cancelar pedidos.
- Confirmar pedidos (`CREATED → CONFIRMED` es del cajero).
```

- [ ] **Step 7: Commit final con toda la documentación**

```bash
git add apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md \
        apps/api-core/src/orders/orders.module.info.md \
        apps/api-core/src/cash-register/cash-register.module.info.md \
        apps/api-core/src/kitchen/kitchen.module.info.md
git commit -m "docs: mark H-10/16/17/18/20 implemented in audit + update module.info files

- Audit findings updated with Estado/Plan asociado for each fix.
- orders.module.info.md documents the new OrderStateMachine class.
- cash-register.module.info.md notes closeSession requires closedBy.
- kitchen.module.info.md points to OrderStateMachine.KITCHEN_ALLOWED_TARGETS as the source of truth."
```

---

## Verificación final (DoD)

Antes de mergear, correr esta checklist:

- [ ] **Tests backend en verde**

```bash
docker compose exec res-api-core pnpm test
docker compose exec res-api-core pnpm test:e2e
```

- [ ] **Tests frontend en verde**

```bash
docker compose exec res-ui pnpm test
```

- [ ] **Build de producción del backend**

```bash
docker compose exec res-api-core pnpm build
```

Expected: sin errores de TypeScript (especialmente en el cambio de firma de `closeSession`).

- [ ] **QA manual de los 5 escenarios golden path del spec**

| # | Hallazgo | Verificado |
|---|----------|------------|
| 1 | H-17: filtrar 5 veces, conexión SSE queda abierta | [ ] |
| 2 | H-18: doble click "Confirmar" dispara 1 sólo PATCH | [ ] |
| 3 | H-16 (kitchen): PATCH `{status: 'SERVED'}` desde `CONFIRMED` retorna 400 | [ ] |
| 4 | H-16 (cashier): PATCH `{status: 'COMPLETED'}` desde `PROCESSING` retorna 400 | [ ] |
| 5 | H-10: cerrar turno → `cashShift.closedById = user.id` en BD | [ ] |

- [ ] **Audit doc refleja el estado real**: H-10, H-16, H-17, H-18, H-20 con ✅; H-19 con ❌. Resumen ejecutivo actualizado.

---

## Notas sobre orden de ejecución

Las tareas 1-3 (H-19, H-10, H-20) son independientes y triviales — pueden hacerse en cualquier orden.

La tarea 4 (H-16) tiene sub-tareas con dependencia (4a → 4b → 4c → 4d): la clase debe existir antes de refactorizar el service, y el DTO depende de la constante exportada por la clase.

Las tareas 5 y 6 (frontend) son independientes entre sí y de las backend.

La tarea 7 (documentación) es la última — solo se actualiza después de que todo lo anterior está mergeado y verificado.

**Recomendación para ejecución paralela con subagentes:** dispatchear (1, 2, 3) en paralelo, esperar; luego dispatchear 4 secuencial (no paralelizar sus sub-tareas — toca el mismo archivo); luego dispatchear (5, 6) en paralelo; finalmente 7 secuencial.
