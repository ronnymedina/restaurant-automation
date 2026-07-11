# R2-04 — Acciones optimistas concurrentes se descartan en silencio (diseño)

**Fecha:** 2026-06-08
**Hallazgo origen:** `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md` → R2-04 (🟡 MEDIO)
**Alcance:** UI únicamente (`apps/ui`). Sin cambios de backend.
**Tipo:** Diseño (precede al plan de implementación).

---

## Problema

Tras el commit `8842af1` ("remove inFlightIds prop — optimistic state handles visual feedback"), conviven dos mecanismos que se contradicen:

1. **Guard de una-acción-por-orden (sigue activo).** En `OrdersPanel.tsx:68-76`, toda acción pasa por `withOptimisticAction(id, …)`, que aborta en silencio (`return`) si ya hay una mutación en vuelo para ese `order.id`:

   ```ts
   function withOptimisticAction(id, patch, fn) {
     if (inFlightRef.current.has(id)) return;   // ← descarte silencioso, sin feedback
     inFlightRef.current.add(id);
     setPendingPatches(...);
     void fn().finally(() => { inFlightRef.current.delete(id); setPendingPatches(...); });
   }
   ```

   "Cobrar" (`onPay`), "Avanzar" (`onAdvance`), "Confirmar" (`onConfirm`), "Completar", "Desmarcar pago" y "Cancelar" comparten el mismo `order.id`, así que compiten por un único cupo en vuelo.

2. **Defensa visual eliminada.** Antes de `8842af1`, `OrderCard` recibía `inFlightIds`, calculaba `isBusy = inFlightIds.has(order.id)`, ponía `aria-busy={isBusy}` y deshabilitaba todos los botones con `disabled={isBusy || …}`. Eso impedía físicamente disparar la segunda acción que el guard iba a descartar. El commit lo quitó asumiendo que el patch optimista re-renderiza la tarjeta y basta como feedback.

**Por qué la suposición falla.** El patch optimista cambia algunos campos, pero no cubre la ventana de red. Escenario concreto:

1. Orden `PROCESSING`, no pagada → la tarjeta muestra **Entregar / Pagado / Cancelar**.
2. El cajero toca **Entregar** → patch optimista `{status:'SERVED'}`; la petición HTTP queda en vuelo y `inFlightRef` contiene el id.
3. La tarjeta re-renderiza a `SERVED`; el botón **Pagado** sigue habilitado (solo depende de `payMethod`).
4. El cajero, sin esperar, elige método y toca **Pagado** → entra a `withOptimisticAction`, ve el id en vuelo → `return` silencioso.
5. Resultado: la orden avanzó pero **el cobro nunca ocurrió**, sin ningún feedback. El cajero cree que cobró.

**Impacto:** riesgo operativo de dinero. No corrompe el backend (cada acción individual es segura allá), pero engaña al operador en el punto de cobro/avance.

---

## Solución

Restaurar la defensa visual (prevención) y agregar un toast en el early-return (red de seguridad). Aprobado: **B + toast**.

### Señal de "busy" sin re-introducir el prop eliminado

`OrdersPanel` ya mantiene `pendingPatches: Map<string, Partial<Order>>` como **state reactivo** con el mismo ciclo de vida que `inFlightRef`: se agrega la entrada al iniciar la acción y se borra en el `.finally`. Se deriva de ahí el conjunto de órdenes ocupadas, evitando re-añadir el `inFlightIds` Set que `8842af1` quitó:

```ts
const busyIds = useMemo(() => new Set(pendingPatches.keys()), [pendingPatches]);
```

### Cambios por archivo

1. **`apps/ui/src/components/dash/orders/OrdersPanel.tsx`**
   - Toast en el early-return de `withOptimisticAction`:
     ```ts
     if (inFlightRef.current.has(id)) { showToast('Procesando el pedido, espera un momento…'); return; }
     ```
   - Derivar `busyIds` (memoizado sobre `pendingPatches`) e incluirlo en `cardCallbacks` como `inFlightIds`.

2. **`apps/ui/src/components/dash/orders/OrderCard.tsx`** — adaptar al layout **actual** (no un revert ciego de `8842af1`):
   - Agregar `inFlightIds?: Set<string>` a la interfaz `OrderCardCallbacks`.
   - `const isBusy = inFlightIds?.has(order.id) ?? false;`
   - `aria-busy={isBusy}` en el div raíz.
   - Sumar `isBusy ||` a la condición `disabled` de: botón primario (preservando su `order.status === 'SERVED'`), select de método, botón "Pagado", "Desmarcar Pago" y "Cancelar".

3. **`apps/ui/src/components/dash/orders/OrdersKanban.tsx`** — incluir `inFlightIds` en la desestructuración de props y en el objeto `cardCallbacks` que se hace spread sobre `OrderCard`.

4. **`apps/ui/src/components/dash/orders/OrdersFilteredList.tsx`** — incluir `inFlightIds` en la desestructuración de props y pasarlo explícitamente a `OrderCard` (esta lista enumera los callbacks uno por uno).

### Diseño de unidades

- `busyIds` deriva de un único origen (`pendingPatches`); no se introduce una segunda fuente de verdad de "in-flight".
- `OrderCard` permanece presentacional: recibe el conjunto y deriva su `isBusy` local, sin saber cómo se computa.
- El threading sigue el patrón existente de `OrderCardCallbacks`, que ambos contenedores ya extienden.

---

## Testing

Tests de UI dentro del contenedor / `node_modules/.bin/vitest` (res-ui no tiene `pnpm` en `exec -T`). Baseline de 13 fallas UI preexistentes: no debe crecer.

- **Regresión nueva** en `OrdersPanel.test.tsx`: orden `PROCESSING` no pagada con método seleccionado → clic en "Pagado" con `markOrderPaid` mockeado que **nunca resuelve** → assert que el botón primario queda `disabled` y la tarjeta expone `aria-busy`. Sin el fix, el primario seguiría habilitado y un segundo clic se descartaría en silencio.
- **No regresión** del test existente `H-18: rapid double-click on Confirmar dispatches confirmOrder once`: el segundo clic ahora cae sobre un botón `disabled` (no-op de `fireEvent.click`), el invariante "se despacha una vez" se mantiene.

---

## Fuera de alcance

- R2-05 (refetch de stats por evento SSE) — hallazgo independiente.
- Encolar la segunda acción tras el settle (opción C del hallazgo) — descartado por complejidad/YAGNI.
- Cambios de backend.
