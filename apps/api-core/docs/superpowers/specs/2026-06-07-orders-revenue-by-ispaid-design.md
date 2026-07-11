# Diseño — R2-02: reporte de caja por `isPaid` (dinero entrante real)

**Fecha:** 2026-06-07
**Hallazgo origen:** R2-02 en `docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`
**Severidad:** 🟡 MEDIO
**Módulos:** `cash-register` (stats), `orders` (repo de reporte + doc), UI `dash/orders` + `commons/ShiftSummaryView`
**Tipo:** Implementación

---

## Problema

Tras migrar al **flujo de cobro en dos pasos** ("Cobrar" → `isPaid=true` sin cambiar status; "Completar" → `SERVED → COMPLETED` aparte), existe un estado nuevo: **`SERVED + isPaid=true`** (dinero ya en caja, status todavía SERVED).

`calculateRevenue` (`cash-register-stats.service.ts:117-131`) clasifica el dinero **por status**, no por `isPaid`:
- `revenue.completed` = Σ `totalAmount` de status `COMPLETED` → UI: **"Ingresos"** / **"Total ingresado"**.
- `revenue.pending` = Σ de todo lo no-`COMPLETED` y no-`CANCELLED` → UI: **"Pendiente cobro"** / **"Pendiente"**.

Una orden `SERVED + isPaid=true` cae en `revenue.pending` rotulada "Pendiente cobro" aunque **ya se cobró**. El cajero ve menos ingresos de los que tiene en caja y un "pendiente" inflado con dinero que ya entró.

### Ejemplo

| Orden | Monto | Status | isPaid | Método |
|---|---|---|---|---|
| A | $10.000 | COMPLETED | ✅ | Efectivo |
| B | $5.000 | SERVED | ✅ | Tarjeta |
| C | $3.000 | PROCESSING | ❌ | Tarjeta (elegido, sin pagar) |

- **Hoy:** Ingresos = $10.000 (solo A); Pendiente cobro = $8.000 (B+C). Los $5.000 de B son dinero ya cobrado mal rotulado.
- **Realidad:** cobrado = A+B = $15.000; pendiente de cobro = C = $3.000.

### Por qué importa a futuro

Con un sistema de pago, una orden entrará `CREATED + isPaid=true` (pagada de entrada). La lógica por status nunca contaría ese dinero hasta completarla manualmente. Keyear por `isPaid` lo resuelve hoy y queda preparado para ese flujo.

### Doc drift asociado

`orders.module.info.md:310` afirma que al pagar una orden `SERVED` se auto-avanza a `COMPLETED`. **El código ya no lo hace** (`orders.service.ts:279`, `nextStatus = order.status`). La doc miente respecto al flujo de dos pasos.

---

## Decisión de diseño

**Regla única — "dinero entrante" = `isPaid=true AND status != CANCELLED`.** Se aplica a todos los buckets de dinero. Una sola definición, no dos criterios.

- Los **counts** (cantidad de pedidos por estado) **NO cambian**: siguen por status. Responden "¿cuántos faltan completar?" (flujo de trabajo), no "¿cuánto dinero entró?" (caja). Un cajero puede ver "0 pendiente de cobro" (dinero) y a la vez "2 pendientes" (órdenes pagadas que faltan completar) — y es correcto.
- La exclusión de `CANCELLED` es defensiva: R2-01 ya garantiza que no existe `CANCELLED + isPaid=true` (para cancelar una orden pagada hay que sacarle el `isPaid` primero). La fórmula no depende de esa garantía.

### Garantía de no-regresión del cierre

Al cierre, `collected` es **idéntico** a `cashShift.totalSales` (persistido en DB): toda orden `COMPLETED` es necesariamente `isPaid` (`assertCanComplete` lo exige) y excluimos canceladas, y `closeSession` no permite cerrar con órdenes no-`COMPLETED` pendientes. **El cierre de caja no cambia; solo se corrige la foto en vivo.** El summary no se persiste como JSON (se recalcula on-demand y se cachea en memoria), así que renombrar campos no afecta datos históricos.

---

## Cambios

### Backend

1. **`orders/order-shift-report.repository.ts`**
   - Agregar `isPaid` al `groupBy.by` de `groupOrdersByShift`.
   - Agregar `isPaid: boolean` al tipo `OrderGroupRow`.

2. **`cash-register/cash-register-stats.service.ts`**
   - Renombrar `ShiftRevenue.completed` → **`collected`** (el nombre `completed` ahora miente).
   - `calculateRevenue` (computar desde las filas crudas filtrando por `isPaid`, no desde `byStatus`):
     - `collected` = Σ `totalAmount` donde `isPaid === true && status !== CANCELLED`.
     - `pending` = Σ `totalAmount` donde `isPaid === false && status !== CANCELLED`.
     - `averageTicket` = `collected / (cantidad de órdenes isPaid=true, no canceladas)`; `0` si no hay pagadas. **El denominador también pasa a "pagadas"** para no inflar el promedio.
   - `buildPaymentMethods`: filtrar por `isPaid === true && status !== CANCELLED && paymentMethod` (en vez de `status === COMPLETED`).
   - `buildCounts` / `groupByStatus` / `countOrdersBy`: **sin cambios** (los counts siguen por status).
   - Actualizar los JSDoc de `calculateRevenue` y `buildPaymentMethods` para reflejar la nueva semántica.

### Frontend (rename de campo + verificación de etiquetas; **sin** tocar formato de moneda)

3. **`apps/ui/src/components/register/api.ts`** — tipo `ShiftRevenue`: `completed` → `collected`.
4. **`apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`** — `stats.revenue.completed` → `stats.revenue.collected`. Etiqueta "Ingresos" se mantiene (ahora sí es dinero cobrado); "Pendiente cobro" se mantiene (ahora sí es solo lo no pagado).
5. **`apps/ui/src/components/commons/ShiftSummaryView.tsx`** — `revenue.completed` → `revenue.collected`. "Total ingresado" se mantiene.

> **Fuera de alcance:** el formato de moneda local (`formatMoney`/settings) de estos paneles es el hallazgo **R2-03**, con su propio fix. Acá solo se cambia la **semántica** del dinero, no el formato.

### Documentación (`.info.md` que describen la lógica vieja)

6. **`orders/orders.module.info.md:310`** — reemplazar la afirmación del auto-avance por la descripción real del flujo de dos pasos (`PATCH /:id/pay` setea `isPaid=true` sin cambiar status; `SERVED → COMPLETED` es un paso aparte que exige `isPaid`).

7. **`cash-register/cash-register.module.info.md`** — actualizar todas las referencias a la lógica vieja:
   - Línea 13: `byPaymentMethod` ahora refleja órdenes pagadas (`isPaid`), no `COMPLETED`.
   - Líneas 56-58: el ejemplo JSON usa `collected` en vez de `completed`.
   - Líneas 91-94: redefinir `revenue.collected` / `revenue.pending` / `revenue.averageTicket` / `byPaymentMethod` por `isPaid && status != CANCELLED`.
   - Líneas 186, 233-236, 252-253: actualizar las tablas de contrato/tests para reflejar `isPaid` y el rename a `collected`.

### Documento de hallazgos

8. **`docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`** — al terminar e implementar, marcar **R2-02 como RESUELTO** (encabezado del hallazgo + fila del resumen ejecutivo), con referencia a este diseño y al plan, igual que se hizo con R2-01.

---

## Tests (TDD)

Unit tests sobre `CashRegisterStatsService` (mock de `OrderShiftReportRepository`):

1. **Escenario del ejemplo** (COMPLETED+paid, SERVED+paid, PROCESSING+unpaid, CANCELLED+unpaid):
   - `revenue.collected` = A+B.
   - `revenue.pending` = C.
   - `revenue.averageTicket` = (A+B) / 2.
   - `byPaymentMethod` = Efectivo→A, Tarjeta→B (C excluida por `isPaid=false`).
   - `counts.pending` = 2 (B SERVED + C PROCESSING) — **sin cambios**, sigue por status.
2. **Borde defensivo:** `CANCELLED + isPaid=true` → excluida de `collected` y de `byPaymentMethod`.
3. **Sin pagadas:** `averageTicket = 0` (no divide por cero).
4. **Equivalencia al cierre:** todo COMPLETED+paid → `collected == Σ totalAmount` (== `totalSales`).

---

## Archivos tocados (resumen)

| Archivo | Cambio |
|---|---|
| `orders/order-shift-report.repository.ts` | `isPaid` en groupBy + tipo |
| `cash-register/cash-register-stats.service.ts` | regla por `isPaid`; rename `completed`→`collected`; JSDoc |
| `apps/ui/src/components/register/api.ts` | tipo `ShiftRevenue.completed`→`collected` |
| `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx` | campo `collected` |
| `apps/ui/src/components/commons/ShiftSummaryView.tsx` | campo `collected` |
| `orders/orders.module.info.md` | corregir auto-avance (línea 310) |
| `cash-register/cash-register.module.info.md` | redefinir semántica de revenue/byPaymentMethod |
| `…/2026-06-07-orders-kiosk-money-audit-findings.md` | marcar R2-02 RESUELTO al terminar |
| Tests unit de stats | escenarios isPaid |
