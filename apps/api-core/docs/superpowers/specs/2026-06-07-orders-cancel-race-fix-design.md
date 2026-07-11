# Fix R2-01 — Race `pay` ‖ `cancel`: optimistic concurrency en `cancelOrder`

**Fecha:** 2026-06-07
**Origen:** Hallazgo `R2-01` de `2026-06-07-orders-kiosk-money-audit-findings.md` (único ALTO; único con riesgo de descuadre real de caja).
**Módulo:** `orders` (backend, api-core). No toca UI, stats ni cierre de caja.
**Tipo:** Diseño / spec de implementación.

---

## Problema

`cancelOrder` decide sobre una lectura previa (`findById` + `assertCanCancel`) y luego ejecuta un `UPDATE` **incondicional** (`order.repository.ts:131-138`). No usa el patrón optimista (`UPDATE ... WHERE status=? AND isPaid=false`) que sí protege a `markAsPaid`/`kitchenAdvanceStatus`/`unmarkAsPaid`.

Secuencia que rompe la caja (dos pantallas sobre la misma orden `SERVED, isPaid=false`):

```
T2  cancelOrder → findById        → lee { SERVED, isPaid:false }   (foto que quedará stale)
T1  markAsPaid  → COMMIT          → { isPaid:true }   (el cajero cobra; efectivo en caja)
T2  assertCanCancel(SERVED,false) → PASA (usa la foto vieja)
T2  repo.cancelOrder → UPDATE incondicional → COMMIT
    Estado final imposible: { status: CANCELLED, isPaid: true }
```

**Impacto monetario:** la orden queda `CANCELLED + isPaid=true`. Los reportes (`revenue`, `byPaymentMethod`, `totalSales`) cuentan **solo** órdenes `COMPLETED`, así que ese dinero no aparece en ninguna cubeta. Una orden `CANCELLED` **no** bloquea `closeSession`. El turno cierra con efectivo físico que el sistema no registró → **descuadre real**, sin rastro de por qué.

Por la vía normal este estado es imposible (`assertCanCancel` exige `!isPaid`, `assertCanComplete` exige `isPaid`). La **única** vía es esta race.

---

## Solución

Llevar a `cancelOrder` el mismo patrón optimista que ya usan los demás flujos: el guard real es un `UPDATE ... WHERE status=? AND isPaid=false` que la base de datos evalúa atómicamente en el momento de escribir; si la orden cambió mientras tanto, afecta 0 filas y rechazamos.

### Por qué `updateMany` y no `update`

`update` de Prisma solo admite campos únicos en su `where` (no `status`/`isPaid`) y **lanza** `RecordNotFound` si no encuentra fila. `updateMany` admite condiciones arbitrarias en el `where` y devuelve `{ count }` en vez de lanzar. Ese `count` (0 = perdí la carrera, 1 = gané) es la señal del control de concurrencia optimista. Es el mismo motivo por el que `transitionStatusIfMatches*` usan `updateMany`.

### 1. Nueva primitiva en el repositorio

`order.repository.ts` — agregar `cancelOrderIfCancellable`, gemela de `transitionStatusIfMatchesAndUnpaid`:

```ts
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

El método `cancelOrder` incondicional actual (`order.repository.ts:131-138`) se **elimina** (no debe quedar una puerta sin guard). Verificar en la implementación que ningún otro consumidor lo use antes de borrarlo.

### 2. `cancelOrder` del service envuelto en transacción

`orders.service.ts:162-171` pasa a seguir el patrón de `markAsPaid`:

```ts
async cancelOrder(id: string, restaurantId: string, reason: string) {
  await this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id, restaurantId } });
    if (!order) throw new OrderNotFoundException(id);
    OrderStateMachine.assertCanCancel(order.status, order.isPaid, id);  // fail-fast amigable (sin colisión)

    const count = await this.orderRepository.cancelOrderIfCancellable(
      tx, id, restaurantId, order.status, reason,
    );
    if (count === 0) {
      // Perdió la carrera: el status derivó o isPaid pasó a true entre el read y el UPDATE.
      // Re-leer y lanzar el error preciso (decisión de diseño: mejor UX que un error genérico).
      const fresh = await tx.order.findFirst({ where: { id, restaurantId } });
      if (!fresh) throw new OrderNotFoundException(id);
      OrderStateMachine.assertCanCancel(fresh.status, fresh.isPaid, id);
      // assertCanCancel no lanzó → la fila cumple las reglas pero el status derivó
      // de otra forma (p.ej. avanzó). Surface InvalidStatusTransition.
      throw new InvalidStatusTransitionException(fresh.status, OrderStatus.CANCELLED);
    }
  });

  // Re-fetch DESPUÉS del commit con el loader canónico, igual que markAsPaid/
  // kitchenAdvanceStatus, para conservar la forma del payload SSE (items eager,
  // BigInt money serializado).
  const updated = await this.orderRepository.findById(id);
  if (!updated) throw new OrderNotFoundException(id);
  const { dashboard, kitchen } = await this.buildOrderUpdatedPayloads(restaurantId, updated);
  this.orderEventsService.emitOrderUpdated(restaurantId, dashboard, kitchen);
  return updated;
}
```

Doble rol de `assertCanCancel`:
- **Inicial (fail-fast):** da el error correcto (`CannotCancelPaidOrder`, `AlreadyCancelled`, `InvalidStatusTransition`) en el 99% de los casos sin colisión, antes de tocar la BD.
- **El guard `WHERE ... isPaid=false` + el re-read con `assertCanCancel`** son la red de seguridad real cuando hay colisión: traducen el `count=0` al error preciso (`CannotCancelPaidOrder` si se pagó, `AlreadyCancelled` si otra pantalla canceló, `InvalidStatusTransition` en cualquier otra deriva).

### 3. Garantía resultante

Invariante reforzado: **una orden nunca puede quedar `CANCELLED && isPaid=true`.** En una carrera pay‖cancel, exactamente una de las dos operaciones gana y la otra falla con un error de dominio claro.

---

## Tests (TDD — escribir antes que la implementación)

En `orders.service.spec.ts` (o el spec correspondiente del módulo `orders`):

1. **Regresión de la race (el test que justifica el fix):** simular pay‖cancel concurrentes sobre la misma orden `SERVED, isPaid=false` y afirmar que el estado final `CANCELLED && isPaid=true` es **imposible** — una de las dos operaciones siempre falla.
2. **Cancel pierde contra pay:** orden pagada entre el read y el UPDATE → `CannotCancelPaidOrderException`.
3. **Cancel pierde contra otro cancel:** orden ya cancelada → `OrderAlreadyCancelledException`.
4. **Cancel exitoso normal** (sin colisión, orden cancelable) → status final `CANCELLED`, `isPaid=false`, emite `orderUpdated`.
5. **Orden inexistente / de otro tenant** → `OrderNotFoundException` (multi-tenant: `restaurantId` del JWT, nunca del cliente).

> Tests siempre dentro del contenedor Docker: `docker compose exec res-api-core pnpm test`.

---

## Documentación

Actualizar `apps/api-core/src/orders/orders.module.info.md`:
- Quitar/corregir el "known gap" que documenta `cancelOrder` **sin** optimistic concurrency.
- Documentar el contrato nuevo: `cancelOrder` es race-safe vía `UPDATE ... WHERE status=? AND isPaid=false` dentro de `$transaction`; en `count=0` re-lee y lanza el error preciso.
- Documentar el invariante: una orden nunca queda `CANCELLED && isPaid=true`.

---

## Fuera de alcance

- **R2-11** (restaurar stock al cancelar): sigue siendo decisión consciente; **no** entra aquí.
- Resto de hallazgos del spec de auditoría (R2-02..R2-12): no se tocan en este fix; R2-01 es el único con descuadre real de caja.
- UI, stats en vivo, formato de moneda y cierre de caja: sin cambios.
