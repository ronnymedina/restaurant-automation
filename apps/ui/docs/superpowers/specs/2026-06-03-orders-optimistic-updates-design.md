# Orders: Optimistic Updates con useOptimistic

**Fecha:** 2026-06-03  
**Alcance:** `apps/ui/src/components/dash/orders/`

## Problema

El flujo actual de mutaciones (confirmar, avanzar estado, cobrar, desmarcar pago, cancelar) tiene dos ineficiencias:

1. **`fetchOrders` innecesario después de cada mutación.** El SSE ya escucha `order:updated` y parchea el estado local. El re-fetch duplica trabajo y puede sobreescribir actualizaciones en vuelo.

2. **UI congela mientras espera el API.** Los botones se deshabilitan y la pantalla no cambia hasta que termina el round-trip HTTP. Con latencia, la experiencia se siente lenta.

## Solución

Agregar `useOptimistic` en `OrdersPanel` para aplicar cambios de estado de forma inmediata en la UI, mientras el API trabaja en background. SSE confirma el estado real. Si el API falla, `useOptimistic` revierte automáticamente.

## Diseño

### Estado optimista

Se mantiene `useState<Order[]>` como fuente de verdad. `useOptimistic` vive encima:

```ts
const [optimisticOrders, applyOptimistic] = useOptimistic(
  orders,
  (state, patch: Partial<Order> & { id: string }) =>
    state.map(o => o.id === patch.id ? { ...o, ...patch } : o)
);
```

`optimisticOrders` (no `orders`) se pasa a `OrdersKanban` y `OrdersFilteredList`.

### Patrón de acción

`withInFlight` se reemplaza por `withOptimisticAction`:

```ts
const [, startTransition] = useTransition();

function withOptimisticAction(
  id: string,
  patch: Partial<Order>,
  fn: () => Promise<void>
) {
  if (inFlightRef.current.has(id)) return; // guard doble-submit
  inFlightRef.current.add(id);
  startTransition(async () => {
    applyOptimistic({ id, ...patch });
    try { await fn(); }
    finally { inFlightRef.current.delete(id); }
  });
}
```

**Flujo en éxito:**
1. Click → `applyOptimistic` → UI actualiza inmediatamente
2. API call resuelve OK → `setOrders` actualiza estado real con `result.data`
3. Transición termina → optimistic descartado, estado real coincide → sin flash
4. SSE llega después → patch idempotente

**Flujo en fallo:**
1. Click → `applyOptimistic` → UI actualiza inmediatamente
2. API call falla → no se llama `setOrders`
3. Transición termina → optimistic revierte a estado anterior
4. Toast de error

### Patches optimistas por operación

| Handler | Patch |
|---------|-------|
| `handleConfirm` | `{ status: 'CONFIRMED' }` |
| `handleAdvance(id, nextStatus)` | `{ status: nextStatus }` |
| `handlePay(id, paymentMethod)` | `{ isPaid: true, paymentMethod }` |
| `handleUnpay(id)` | `{ isPaid: false, paymentMethod: undefined }` |
| `handleCancelConfirm(id, reason)` | `{ status: 'CANCELLED', cancellationReason: reason }` |

### SSE — quitar guard de filtro en handleUpdated

```ts
// Antes:
const handleUpdated = (e) => {
  if (activeFilterRef.current) return; // ← se elimina
  setOrders(prev => prev.map(...));
};

// handleNew mantiene su guard (no agregar órdenes que no cumplen el filtro activo)
const handleNew = (e) => {
  if (activeFilterRef.current) return; // ← se mantiene
  ...
};
```

Esto permite que los cambios de estado se reflejen via SSE incluso con filtro activo, sin necesidad de re-fetch.

### fetchOrders — cuándo se llama

| Situación | fetchOrders |
|-----------|-------------|
| Carga inicial | ✓ |
| Filtro aplicado o limpiado | ✓ |
| SSE reconecta (blip de red) | ✓ |
| Después de mutación (cualquiera) | ✗ eliminado |

### Simplificación de OrderCard

Con `useOptimistic`, cuando el usuario avanza una orden la card se mueve de columna inmediatamente. No hay botón viejo que deshabilitar. Se eliminan:

- Prop `inFlightIds?: Set<string>`
- Variable `isBusy`
- `disabled={isBusy}` en todos los botones
- `aria-busy={isBusy}`

El guard de doble-submit (`inFlightRef`) sigue en `OrdersPanel` — es sincrónico y no requiere re-renders.

Se elimina también `inFlightVersion` state (solo existía para forzar re-renders con el viejo patrón).

## Archivos afectados

- `OrdersPanel.tsx` — cambios principales
- `OrderCard.tsx` — eliminar `inFlightIds`/`isBusy`
- `OrdersKanban.tsx` — eliminar `inFlightIds` del prop drilling
- `OrdersFilteredList.tsx` — eliminar `inFlightIds` del prop drilling

## Fuera de alcance

- Animaciones al mover cards entre columnas
- `useOptimistic` para creación de órdenes (`CreateOrderModal`)
- Refactoring de `OrdersPanel` a custom hook
