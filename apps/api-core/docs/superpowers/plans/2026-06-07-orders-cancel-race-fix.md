# Fix R2-01 — `cancelOrder` optimistic concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la race `pay ‖ cancel` que deja órdenes en el estado imposible `CANCELLED && isPaid=true` (dinero cobrado que desaparece del cierre de caja), aplicando a `cancelOrder` el mismo patrón de concurrencia optimista que ya usa `markAsPaid`.

**Architecture:** Se añade una primitiva de repositorio `cancelOrderIfCancellable` que hace un `updateMany` guardado por `status=? AND isPaid=false` y devuelve el `count`. `OrdersService.cancelOrder` se reescribe dentro de una `$transaction` (read + conditional update); si `count=0` re-lee y lanza el error preciso. Se elimina el `cancelOrder` incondicional del repositorio. Mismo patrón, archivos y estilo que el flujo `markAsPaid` (audit H-05).

**Tech Stack:** NestJS, Prisma (PostgreSQL), Jest. Tests siempre dentro del contenedor Docker.

**Spec de referencia:** `docs/superpowers/specs/2026-06-07-orders-cancel-race-fix-design.md`

---

## File Structure

- `apps/api-core/src/orders/order.repository.ts` — añadir `cancelOrderIfCancellable`; eliminar `cancelOrder` incondicional (`:131-138`).
- `apps/api-core/src/orders/orders.service.ts` — reescribir `cancelOrder` (`:162-171`) con `$transaction` + conditional update + error preciso en `count=0`.
- `apps/api-core/src/orders/order.repository.spec.ts` — test de la nueva primitiva (mock `updateMany`).
- `apps/api-core/src/orders/orders.service.spec.ts` — reescribir el `describe('cancelOrder')` para el nuevo flujo transaccional + casos de race.
- `apps/api-core/src/orders/orders.module.info.md` — reemplazar el "Known gap" (`:379-384`) por el contrato nuevo.

> **Nota sobre comandos de test:** todos los `pnpm test` corren dentro del contenedor:
> `docker compose exec res-api-core pnpm test -- <ruta> -t "<patrón>"`
> Asegúrate de que el stack esté arriba (`docker compose up -d res-api-core res-db`) antes de empezar.

---

## Task 1: Primitiva `cancelOrderIfCancellable` en el repositorio

**Files:**
- Modify: `apps/api-core/src/orders/order.repository.ts` (añadir método tras `unmarkAsPaidIfPaid`, `:277-287`)
- Test: `apps/api-core/src/orders/order.repository.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

En `order.repository.spec.ts`, añadir un `describe` para la nueva primitiva. Sigue el patrón de los tests existentes de `transitionStatusIfMatchesAndUnpaid` en ese archivo (mock de `tx.order.updateMany` devolviendo `{ count }`). Si no existe un mock `tx` previo, usar este:

```ts
describe('cancelOrderIfCancellable', () => {
  it('issues a guarded updateMany (status + isPaid=false) and returns the count', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { order: { updateMany } } as any;

    const count = await repository.cancelOrderIfCancellable(
      tx, 'o1', 'r1', OrderStatus.SERVED, 'cliente se retiró',
    );

    expect(count).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', restaurantId: 'r1', status: OrderStatus.SERVED, isPaid: false },
      data: { status: OrderStatus.CANCELLED, cancellationReason: 'cliente se retiró' },
    });
  });

  it('returns 0 when no row matches the guard (lost race)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = { order: { updateMany } } as any;

    const count = await repository.cancelOrderIfCancellable(
      tx, 'o1', 'r1', OrderStatus.SERVED, 'reason',
    );

    expect(count).toBe(0);
  });
});
```

> Si `order.repository.spec.ts` aún no importa `OrderStatus` desde `@prisma/client`, añadir el import. Reutilizar la variable `repository` ya existente en el `beforeEach` del archivo.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec res-api-core pnpm test -- order.repository.spec -t "cancelOrderIfCancellable"`
Expected: FAIL — `repository.cancelOrderIfCancellable is not a function`.

- [ ] **Step 3: Implementar la primitiva**

En `order.repository.ts`, **eliminar** el método `cancelOrder` incondicional (`:131-138`):

```ts
// BORRAR este bloque completo:
async cancelOrder(id: string, reason: string) {
  const order = await this.prisma.order.update({
    where: { id },
    data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
    include: ORDER_WITH_ITEMS,
  });
  return new OrderSerializer(order);
}
```

Y **añadir** la primitiva guardada tras `unmarkAsPaidIfPaid` (al final de la clase, junto a las demás `*IfMatches*`), con el mismo estilo de JSDoc:

```ts
/**
 * Race-safe cancel (audit R2-01). Atomically transitions the order to
 * CANCELLED, but only if its status still matches `expectedStatus` AND it is
 * currently unpaid. The `isPaid = false` guard is what closes the pay‖cancel
 * race: if a concurrent markAsPaid committed between the caller's read and
 * this UPDATE, no row matches and count = 0, so the cancel is rejected instead
 * of producing the impossible {CANCELLED, isPaid:true} state. Mirror of
 * `transitionStatusIfMatchesAndUnpaid`.
 *
 * @returns 1 if the cancel committed, 0 if status drifted or the order was paid
 */
async cancelOrderIfCancellable(
  tx: Prisma.TransactionClient,
  id: string,
  restaurantId: string,
  expectedStatus: OrderStatus,
  reason: string,
): Promise<number> {
  const result = await tx.order.updateMany({
    where: { id, restaurantId, status: expectedStatus, isPaid: false },
    data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
  });
  return result.count;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec res-api-core pnpm test -- order.repository.spec -t "cancelOrderIfCancellable"`
Expected: PASS (2 tests verdes).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/order.repository.ts apps/api-core/src/orders/order.repository.spec.ts
git commit -m "feat(orders): add cancelOrderIfCancellable guarded primitive (R2-01)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Reescribir `OrdersService.cancelOrder` con transacción + error preciso

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts:162-171`
- Test: `apps/api-core/src/orders/orders.service.spec.ts` (reescribir `describe('cancelOrder')`, `:137-184`)

> El `describe('cancelOrder')` actual mockea `mockOrderRepository.cancelOrder` (el método que estamos eliminando) y asume el flujo no-transaccional viejo. Hay que reescribirlo para el flujo nuevo, reutilizando el helper `stubTxWithOrder` que ya usa el `describe('markAsPaid')` (`:192-206`). Como `stubTxWithOrder` está declarado **dentro** del `describe('markAsPaid')`, hay que añadir una copia local equivalente dentro del `describe('cancelOrder')` (no extraerla — mantener el cambio acotado y evitar tocar markAsPaid).

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar **todo** el bloque `describe('cancelOrder', () => { ... })` (`:137-184`) por:

```ts
describe('cancelOrder', () => {
  // cancelOrder ahora lee la orden dentro de una $transaction (igual que
  // markAsPaid). El stub default de $transaction (cb => cb(mockPrisma)) no
  // expone order.findFirst, así que lo sobreescribimos por test. La findFirst
  // se llama 1 vez en el camino feliz y hasta 2 veces cuando se pierde la
  // carrera (read inicial + re-read para el error preciso); por eso aceptamos
  // una secuencia de valores.
  const stubTxWithOrders = (...orders: any[]) => {
    const findFirst = jest.fn();
    orders.forEach((o) => findFirst.mockResolvedValueOnce(o));
    mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
      cb({ order: { findFirst } }),
    );
  };

  afterEach(() => {
    mockPrisma.$transaction.mockReset();
    mockPrisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));
  });

  it('throws OrderNotFoundException when order does not exist', async () => {
    stubTxWithOrders(null);
    await expect(service.cancelOrder('missing', 'r1', 'reason'))
      .rejects.toThrow(OrderNotFoundException);
    expect(mockOrderRepository.cancelOrderIfCancellable).not.toHaveBeenCalled();
  });

  it('throws OrderAlreadyCancelledException when already cancelled (fail-fast)', async () => {
    stubTxWithOrders(makeOrder({ status: OrderStatus.CANCELLED }));
    await expect(service.cancelOrder('o1', 'r1', 'reason'))
      .rejects.toThrow(OrderAlreadyCancelledException);
    expect(mockOrderRepository.cancelOrderIfCancellable).not.toHaveBeenCalled();
  });

  it('throws InvalidStatusTransitionException when COMPLETED (fail-fast)', async () => {
    stubTxWithOrders(makeOrder({ status: OrderStatus.COMPLETED }));
    await expect(service.cancelOrder('o1', 'r1', 'reason'))
      .rejects.toThrow(InvalidStatusTransitionException);
    expect(mockOrderRepository.cancelOrderIfCancellable).not.toHaveBeenCalled();
  });

  it('throws CannotCancelPaidOrderException when order is paid (fail-fast)', async () => {
    stubTxWithOrders(makeOrder({ status: OrderStatus.CREATED, isPaid: true }));
    await expect(service.cancelOrder('o1', 'r1', 'reason'))
      .rejects.toThrow(CannotCancelPaidOrderException);
    expect(mockOrderRepository.cancelOrderIfCancellable).not.toHaveBeenCalled();
  });

  it('cancels a CONFIRMED unpaid order and emits updated event', async () => {
    const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
    stubTxWithOrders(makeOrder({ status: OrderStatus.CONFIRMED, isPaid: false }));
    mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(1);
    mockOrderRepository.findById.mockResolvedValue(cancelled);

    const result = await service.cancelOrder('o1', 'r1', 'reason');

    expect(mockOrderRepository.cancelOrderIfCancellable).toHaveBeenCalledWith(
      expect.anything(), 'o1', 'r1', OrderStatus.CONFIRMED, 'reason',
    );
    expect(result).toEqual(cancelled);
    expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ id: cancelled.id, status: cancelled.status, isPaid: cancelled.isPaid }),
      expect.objectContaining({ id: cancelled.id, orderNumber: cancelled.orderNumber }),
    );
  });

  // --- Race detection (audit R2-01) -------------------------------------
  it('lost race to a payment → CannotCancelPaidOrderException (count=0, re-read shows paid)', async () => {
    // Read inicial: SERVED+unpaid (pasa el fail-fast). Entre el read y el
    // UPDATE, markAsPaid commitea → guard isPaid=false no matchea → count=0.
    // Re-read muestra isPaid=true → assertCanCancel lanza CannotCancelPaid.
    stubTxWithOrders(
      makeOrder({ status: OrderStatus.SERVED, isPaid: false }),  // read inicial
      makeOrder({ status: OrderStatus.SERVED, isPaid: true }),   // re-read
    );
    mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(0);

    await expect(service.cancelOrder('o1', 'r1', 'reason'))
      .rejects.toThrow(CannotCancelPaidOrderException);
    expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
  });

  it('lost race to another cancel → OrderAlreadyCancelledException (count=0, re-read shows cancelled)', async () => {
    stubTxWithOrders(
      makeOrder({ status: OrderStatus.SERVED, isPaid: false }),     // read inicial
      makeOrder({ status: OrderStatus.CANCELLED, isPaid: false }),  // re-read
    );
    mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(0);

    await expect(service.cancelOrder('o1', 'r1', 'reason'))
      .rejects.toThrow(OrderAlreadyCancelledException);
    expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
  });

  it('lost race to an advance → InvalidStatusTransitionException (count=0, re-read still cancellable)', async () => {
    // Re-read sigue siendo cancelable (no pagado, no cancelado), pero el status
    // derivó (p.ej. avanzó) → assertCanCancel no lanza, caemos al
    // InvalidStatusTransition explícito.
    stubTxWithOrders(
      makeOrder({ status: OrderStatus.PROCESSING, isPaid: false }),  // read inicial
      makeOrder({ status: OrderStatus.SERVED, isPaid: false }),      // re-read (derivó)
    );
    mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(0);

    await expect(service.cancelOrder('o1', 'r1', 'reason'))
      .rejects.toThrow(InvalidStatusTransitionException);
    expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
  });
});
```

También añadir `cancelOrderIfCancellable: jest.fn(),` al objeto `mockOrderRepository` (`:21-31`) y eliminar la línea `cancelOrder: jest.fn(),` (`:25`) que ya no existe en el repo.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec res-api-core pnpm test -- orders.service.spec -t "cancelOrder"`
Expected: FAIL — el `cancelOrder` actual aún llama `findById`/`cancelOrder` (no transaccional) y `cancelOrderIfCancellable` no se invoca.

- [ ] **Step 3: Reescribir `cancelOrder` en el service**

Reemplazar `orders.service.ts:162-171` por:

```ts
async cancelOrder(id: string, restaurantId: string, reason: string) {
  // Race-safe cancel (audit R2-01). Sin esto, un cancel sobre una lectura
  // stale podía pisar un markAsPaid concurrente y dejar la orden en el estado
  // imposible {CANCELLED, isPaid:true} — dinero cobrado que desaparece del
  // cierre de caja. Mismo patrón que markAsPaid (H-05): read + conditional
  // UPDATE dentro de una $transaction; el guard isPaid=false de
  // cancelOrderIfCancellable es la fuente de verdad. Si count=0, re-leemos y
  // lanzamos el error preciso para que el cajero entienda qué pasó.
  await this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id, restaurantId } });
    if (!order) throw new OrderNotFoundException(id);
    // Fail-fast amigable en el 99% de los casos sin colisión.
    OrderStateMachine.assertCanCancel(order.status, order.isPaid, id);

    const count = await this.orderRepository.cancelOrderIfCancellable(
      tx, id, restaurantId, order.status, reason,
    );
    if (count === 0) {
      // Perdió la carrera: status derivó o isPaid pasó a true entre el read y
      // el UPDATE. Re-leer y traducir al error preciso.
      const fresh = await tx.order.findFirst({ where: { id, restaurantId } });
      if (!fresh) throw new OrderNotFoundException(id);
      OrderStateMachine.assertCanCancel(fresh.status, fresh.isPaid, id);
      // assertCanCancel no lanzó → la fila cumple las reglas pero el status
      // derivó de otra forma (p.ej. avanzó). Surface InvalidStatusTransition.
      throw new InvalidStatusTransitionException(fresh.status, OrderStatus.CANCELLED);
    }
  });

  // Re-fetch DESPUÉS del commit con el loader canónico (items eager, BigInt
  // serializado), igual que markAsPaid/kitchenAdvanceStatus, para conservar la
  // forma del payload SSE.
  const updated = await this.orderRepository.findById(id);
  if (!updated) throw new OrderNotFoundException(id);
  const { dashboard, kitchen } = await this.buildOrderUpdatedPayloads(restaurantId, updated);
  this.orderEventsService.emitOrderUpdated(restaurantId, dashboard, kitchen);
  return updated;
}
```

> `OrderStateMachine`, `InvalidStatusTransitionException`, `OrderNotFoundException` y `CannotCancelPaidOrderException` ya están importados en `orders.service.ts:9-22`. No hace falta tocar imports.

- [ ] **Step 4: Correr los tests del describe y verificar que pasan**

Run: `docker compose exec res-api-core pnpm test -- orders.service.spec -t "cancelOrder"`
Expected: PASS (8 tests verdes).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.service.spec.ts
git commit -m "fix(orders): race-safe cancelOrder with optimistic concurrency (R2-01)

Cierra la race pay-cancel que dejaba ordenes en {CANCELLED, isPaid:true},
descuadrando el cierre de caja. cancelOrder ahora corre dentro de una
\$transaction con UPDATE guardado por isPaid=false; en count=0 re-lee y
lanza el error preciso.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Actualizar la documentación del módulo

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md:379-384` (sección "Known gap")

- [ ] **Step 1: Reemplazar el "Known gap" por el contrato nuevo**

Reemplazar el bloque `:379-384`:

```markdown
**Known gap (out of scope for this audit cycle):** `cancelOrder` still uses
an unconditional `update` without status guard, so a concurrent cancel can
overwrite an advance that committed milliseconds earlier. This is observable
but not corrupting: the final persisted state is always a valid terminal
state ({CANCELLED, SERVED, COMPLETED}). Hardening `cancelOrder` to the same
optimistic pattern is a backlog follow-up.
```

por:

```markdown
**Cancel is race-safe too (audit R2-01):** `cancelOrder` follows the same
optimistic pattern. It runs read + conditional UPDATE inside a `$transaction`
via `cancelOrderIfCancellable`, whose guard is
`UPDATE ... WHERE id=? AND restaurantId=? AND status=? AND isPaid=false`. The
`isPaid=false` guard is the critical part: if a concurrent `markAsPaid`
committed between the read and the UPDATE, no row matches, count = 0, and the
service re-reads the row to throw the precise error
(`CannotCancelPaidOrderException` if it was paid,
`OrderAlreadyCancelledException` if another screen cancelled,
`InvalidStatusTransitionException` otherwise).

**Invariant:** an order can never end up `CANCELLED && isPaid=true`. In a
pay‖cancel race exactly one operation wins and the other fails with a clear
domain error, so paid cash is never lost from the cash-shift close.
```

- [ ] **Step 2: Verificar que no queden otras referencias al gap**

Run: `docker compose exec res-api-core grep -rn "Known gap\|unconditional update\|backlog follow-up" src/orders/orders.module.info.md`
Expected: sin resultados (el bloque viejo ya no existe).

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/orders/orders.module.info.md
git commit -m "docs(orders): document race-safe cancelOrder + invariant (R2-01)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Verificación final de la suite

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Correr la suite completa del módulo orders**

Run: `docker compose exec res-api-core pnpm test -- orders`
Expected: PASS — todos los specs de `src/orders/` verdes, sin tests que aún referencien `mockOrderRepository.cancelOrder`.

- [ ] **Step 2: Buscar referencias huérfanas al método eliminado**

Run: `docker compose exec res-api-core grep -rn "orderRepository.cancelOrder\b\|repository.cancelOrder\b\|\.cancelOrder(" src --include=*.ts | grep -v cancelOrderIfCancellable`
Expected: solo apariciones de `service.cancelOrder(` (el método del service, que sigue existiendo). Ninguna llamada a `repository.cancelOrder(` ni `orderRepository.cancelOrder(`. Si aparece alguna, actualizarla a `cancelOrderIfCancellable` o eliminarla según corresponda.

- [ ] **Step 3: (Opcional) Correr el e2e de cancel si el entorno lo permite**

Run: `docker compose exec res-api-core pnpm test:e2e -- cancelOrder`
Expected: PASS. Si el e2e no corre en este entorno por razones preexistentes, anotarlo y continuar (no es bloqueante para este fix).

---

## Self-Review (completado al escribir el plan)

- **Spec coverage:** primitiva guardada (Task 1) ✓; `cancelOrder` transaccional + error preciso (Task 2) ✓; eliminación del `cancelOrder` incondicional (Task 1, Step 3) ✓; tests de regresión de race pay‖cancel / cancel‖cancel / cancel‖advance + camino feliz + not-found (Task 2) ✓; actualización de `orders.module.info.md` (Task 3) ✓. Fuera de alcance (R2-11 stock, UI, stats) — no hay tareas, correcto.
- **Placeholder scan:** sin TBD/TODO; todo el código de tests e implementación está completo.
- **Type consistency:** `cancelOrderIfCancellable(tx, id, restaurantId, expectedStatus, reason)` con la misma firma en Task 1 (definición), Task 2 (llamada + mock) y Task 3 (doc). El mock `mockOrderRepository.cancelOrderIfCancellable` se añade en Task 2, Step 1.
