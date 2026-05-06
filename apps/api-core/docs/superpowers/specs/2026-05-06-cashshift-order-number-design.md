# Design: CashShift order number counter — eliminación de contención

**Fecha:** 2026-05-06
**Estado:** Aprobado
**Relacionado con:** ERR-05 en `docs/testing.errors.md`

## Problema

`CashShift.lastOrderNumber` se incrementa con `{ increment: 1 }` dentro de la transacción principal de creación de órdenes. Esta transacción también valida y decrementa stock (múltiples `UPDATE` por ítem) e inserta la orden con sus `OrderItem`. Bajo 50 VUs concurrentes, todas las transacciones compiten por el lock de la misma fila `CashShift`, que se mantiene por ~300–600ms mientras dura la transacción completa.

Resultado observado en Jaeger (50 VUs, `orders-with-stock.js`):
- p95: 541ms (con Jaeger overhead)
- max: 5.35s
- `UPDATE CashShift.lastOrderNumber` mostraba 336ms de lock wait

## Decisión

**Opción A — Dos transacciones separadas.** El increment se mueve a una transacción corta e independiente que se ejecuta antes de la transacción principal.

```
Tx1 (~2ms):     UPDATE CashShift SET lastOrderNumber++ RETURNING lastOrderNumber
Tx2 (~50ms):    validar stock + decrementar + INSERT Order con el número pre-obtenido
```

El lock de `CashShift` se libera después de Tx1. Tx2 no toca `CashShift`.

**Trade-off aceptado:** Si Tx2 falla (ej. decremento atómico detecta stock insuficiente), el número de Tx1 queda consumido sin crear una orden — gap en la secuencia del turno. Aceptable: `orderNumber` es solo un número de display en el ticket, no se usa como métrica de negocio ni para calcular totales (los totales se calculan directamente desde la tabla `Order`).

## Opciones evaluadas

### Opción A — Dos transacciones separadas ✅ (elegida)

Separar el increment de `lastOrderNumber` en una Tx1 propia, antes de la Tx2 principal.

**Pros:** Cambio mínimo al código existente. Sin nuevas dependencias. Fácil de razonar y testear. Elimina ~95% del tiempo de contención en `CashShift`.

**Contras:** Posibles gaps en la secuencia si Tx2 falla. El lock de `CashShift` sigue existiendo pero dura ~2ms en lugar de ~300–600ms.

### Opción B — PostgreSQL SEQUENCE por CashShift

Al abrir una caja, crear una sequence dedicada: `CREATE SEQUENCE cash_shift_seq_<id>`. Al crear una orden, `SELECT nextval(...)` fuera de cualquier transacción. Al cerrar, `DROP SEQUENCE`.

**Pros:** Contención prácticamente cero. Las sequences de Postgres usan locks internos ultraligeros, no row-level locks. Solución más correcta a nivel de infraestructura.

**Contras:** Requiere SQL crudo vía `prisma.$executeRaw` (Prisma no soporta sequences). Gestión dinámica de sequences (crear al abrir, dropear al cerrar). Migración manual para cajas ya abiertas. Mayor complejidad en tests. No agrega valor visible para el volumen actual de un restaurante.

**Cuándo reconsiderar:** Si la carga escala a cientos de VUs concurrentes y la Opción A sigue siendo cuello de botella.

### Opción C — Redis INCR

Usar `INCR cash_shift:<id>:order_count` como contador atómico externo.

**Pros:** Sub-millisecond, sin contención en DB.

**Contras:** Agrega Redis como nueva dependencia de infraestructura. Introduce un punto de falla externo. Overkill para el volumen de un restaurante.

## Impacto en el código

**`apps/api-core/src/orders/orders.service.ts`**
- `persistOrder`: extraer el `tx.cashShift.update({ increment: 1 })` de la transacción Prisma y ejecutarlo como `this.prisma.cashShift.update(...)` antes de llamar a `$transaction`.

**Tests unitarios (`orders.service.spec.ts`)**
- El mock de `mockPrisma.cashShift.update` actualmente está dentro del contexto de la transacción. Debe moverse al mock de `prisma` top-level.

**No requiere migración de schema:** `lastOrderNumber` sigue siendo un `Int` en `CashShift`. No hay cambios al modelo de datos.
