# R2-02 — Reporte de caja por `isPaid` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las estadísticas de caja cuenten el dinero entrante por `isPaid=true` (excluyendo canceladas) en vez de por status `COMPLETED`, para que el reporte en vivo refleje el dinero real cobrado.

**Architecture:** Una sola regla de "dinero entrante" (`isPaid=true AND status != CANCELLED`) aplicada a `revenue.collected`, `revenue.pending` (complemento), `averageTicket` y `byPaymentMethod`. Los counts siguen por status (flujo de trabajo). Requiere agregar `isPaid` al `groupBy` del repo de reporte. El campo `ShiftRevenue.completed` se renombra a `collected`.

**Tech Stack:** NestJS + Prisma (`groupBy`), Jest (unit), Astro/React (UI types).

**Tests SIEMPRE dentro del contenedor Docker** (ver CLAUDE.md): `docker compose exec res-api-core pnpm test ...`.

**Diseño de referencia:** `docs/superpowers/specs/2026-06-07-orders-revenue-by-ispaid-design.md`

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---|---|---|
| `src/orders/order-shift-report.repository.ts` | groupBy de órdenes del turno | `isPaid` en `by` + en `OrderGroupRow` |
| `src/cash-register/cash-register-stats.service.ts` | cálculo de stats | regla por `isPaid`; rename `completed`→`collected`; JSDoc |
| `src/cash-register/cash-register-stats.service.spec.ts` | unit tests de stats | escenarios isPaid |
| `apps/ui/src/components/dash/register/api.ts` | tipos de la API de caja | `ShiftRevenue.completed`→`collected` |
| `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx` | panel en vivo | leer `revenue.collected` |
| `apps/ui/src/components/commons/ShiftSummaryView.tsx` | resumen de cierre/historial | tipo + leer `revenue.collected` |
| `src/orders/orders.module.info.md` | doc orders | corregir auto-avance (línea 310) |
| `src/cash-register/cash-register.module.info.md` | doc caja | redefinir semántica revenue/byPaymentMethod |
| `docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md` | hallazgos | marcar R2-02 RESUELTO |

---

## Task 1: Tests de stats por `isPaid` (TDD — rojo)

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register-stats.service.spec.ts`

- [ ] **Step 1: Actualizar el test de sesión vacía al nuevo nombre de campo**

Reemplazar la aserción de `revenue` en el test `retorna summary en cero para una sesión vacía` (línea 45):

```ts
expect(summary.revenue).toEqual({ collected: 0n, pending: 0n, averageTicket: 0n });
```

- [ ] **Step 2: Añadir `isPaid` a las filas del test de counts**

En el test `cuenta cada status correctamente y calcula pending`, agregar `isPaid` a cada fila mock (los counts no cambian, pero las filas ahora llevan el campo). Reemplazar el array `mockResolvedValue` por:

```ts
mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
  { status: OrderStatus.CREATED,    paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: false, _count: { id: 2 }, _sum: { totalAmount: 2000n } },
  { status: OrderStatus.CONFIRMED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1000n } },
  { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1500n } },
  { status: OrderStatus.SERVED,     paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1200n } },
  { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
  { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:  800n } },
]);
```

- [ ] **Step 3: Reescribir el test de revenue al escenario por `isPaid`**

Reemplazar por completo el test `calcula revenue correctamente (completed, pending, averageTicket)` por:

```ts
it('calcula revenue por isPaid: collected, pending y averageTicket', async () => {
  // A: completada+pagada; B: servida+pagada (dinero ya en caja); C: en preparación sin pagar; D: cancelada
  mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
    { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount: 10000n } },
    { status: OrderStatus.SERVED,     paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount:  5000n } },
    { status: OrderStatus.PROCESSING, paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:  3000n } },
    { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:   800n } },
  ]);
  mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

  const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

  expect(summary.revenue.collected).toBe(15000n);     // A + B (ambas pagadas)
  expect(summary.revenue.pending).toBe(3000n);        // C (sin pagar); CANCELLED excluida
  expect(summary.revenue.averageTicket).toBe(7500n);  // 15000 / 2 órdenes pagadas
});
```

- [ ] **Step 4: Reescribir el test de averageTicket sin pagadas**

Reemplazar el test `averageTicket es 0n cuando no hay pedidos completados` por:

```ts
it('averageTicket es 0n cuando no hay órdenes pagadas', async () => {
  mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
    { status: OrderStatus.CREATED, paymentMethod: null, orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1000n } },
  ]);
  mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

  const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

  expect(summary.revenue.collected).toBe(0n);
  expect(summary.revenue.averageTicket).toBe(0n);
});
```

- [ ] **Step 5: Reescribir el test de byPaymentMethod por `isPaid` + borde defensivo**

Reemplazar el test `byPaymentMethod incluye solo órdenes COMPLETED` por:

```ts
it('byPaymentMethod incluye solo órdenes pagadas (isPaid), excluye no pagadas y canceladas', async () => {
  mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
    { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 2 }, _sum: { totalAmount: 4000n } },
    { status: OrderStatus.SERVED,    paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount: 2000n } },
    { status: OrderStatus.PROCESSING,paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1500n } }, // elegido pero sin pagar
    { status: OrderStatus.CANCELLED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount:  500n } }, // borde defensivo: no debe contar
  ]);
  mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

  const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

  expect(summary.byPaymentMethod).toHaveLength(2);
  expect(summary.byPaymentMethod).toEqual(
    expect.arrayContaining([
      { method: 'CASH', count: 2, total: 4000n }, // solo la COMPLETED pagada; la CANCELLED pagada excluida
      { method: 'CARD', count: 1, total: 2000n }, // la SERVED pagada; la PROCESSING sin pagar excluida
    ]),
  );
});
```

- [ ] **Step 6: Añadir `isPaid` a las filas de los tests restantes**

En `byOrderType agrega todos los statuses incluyendo CANCELLED` (línea ~122), agregar `isPaid: false` (o `true` donde aplique) a cada fila para que el tipo `OrderGroupRow` quede satisfecho. Reemplazar el array por:

```ts
mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
  { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP',   orderSource: 'STAFF', isPaid: true,  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
  { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'DELIVERY', orderSource: 'KIOSK', isPaid: false, _count: { id: 2 }, _sum: { totalAmount: 2000n } },
  { status: OrderStatus.CANCELLED, paymentMethod: null,   orderType: 'PICKUP',   orderSource: 'KIOSK', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:  800n } },
]);
```

- [ ] **Step 7: Correr los tests y verificar que fallan**

Run: `docker compose exec res-api-core pnpm test cash-register-stats.service.spec`
Expected: FAIL — `summary.revenue.collected` es `undefined` (el servicio aún expone `completed`) y `byPaymentMethod` aún filtra por COMPLETED.

---

## Task 2: Repo — `isPaid` en el groupBy

**Files:**
- Modify: `apps/api-core/src/orders/order-shift-report.repository.ts`

- [ ] **Step 1: Agregar `isPaid` al destructuring del enum y al `by`**

Reemplazar la línea 6:

```ts
const { status, paymentMethod, orderType, orderSource, isPaid } = Prisma.OrderScalarFieldEnum;
```

Y en `groupOrdersByShift`, reemplazar el `by`:

```ts
by: [status, paymentMethod, orderType, orderSource, isPaid],
```

- [ ] **Step 2: Agregar `isPaid` al tipo `OrderGroupRow`**

En la interfaz `OrderGroupRow` (líneas 9-16), agregar el campo:

```ts
export interface OrderGroupRow {
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  orderType: string | null;
  orderSource: string | null;
  isPaid: boolean;
  _sum: { totalAmount: bigint | null };
  _count: { id: number };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/orders/order-shift-report.repository.ts
git commit -m "feat(cash-register): group shift orders by isPaid for revenue stats (R2-02)"
```

---

## Task 3: Servicio — regla por `isPaid` + rename `collected` (TDD — verde)

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register-stats.service.ts`

- [ ] **Step 1: Renombrar el campo en la interfaz `ShiftRevenue`**

Reemplazar la interfaz (líneas 19-23):

```ts
export interface ShiftRevenue {
  collected: bigint;
  pending: bigint;
  averageTicket: bigint;
}
```

- [ ] **Step 2: Cambiar el caller a pasar `groups` crudos**

En `getSummary`, reemplazar la línea 61 (`revenue: this.calculateRevenue(byStatus),`) por:

```ts
      revenue: this.calculateRevenue(groups),
```

- [ ] **Step 3: Reescribir `calculateRevenue` por `isPaid`**

Reemplazar el método completo `calculateRevenue` (líneas 102-131, incluyendo su JSDoc) por:

```ts
  /**
   * Calcula el dinero del turno con la regla única de "dinero entrante":
   * una orden cuenta como cobrada cuando `isPaid === true` y no está
   * cancelada — independiente de su status (el flujo de cobro en dos pasos
   * permite SERVED+isPaid, e incluso CREATED+isPaid con un sistema de pago).
   *
   * - collected: Σ totalAmount de órdenes pagadas no canceladas. El método de
   *   pago NO es señal de cobro (el cliente lo elige en el kiosk sin pagar);
   *   isPaid sí lo es.
   * - pending: Σ totalAmount de órdenes NO pagadas no canceladas (dinero
   *   comprometido pero aún sin cobrar).
   * - averageTicket: collected / cantidad de órdenes pagadas. Floor division
   *   en centavos (audit H-30): la pérdida es ≤ paidCount-1 centavos por turno;
   *   el serializer aplica fromCents y la UI muestra 2 decimales.
   *
   * La exclusión de CANCELLED es defensiva: R2-01 garantiza que no existe
   * CANCELLED+isPaid (para cancelar una orden pagada hay que sacarle el isPaid
   * primero). Al cierre, collected == cashShift.totalSales (toda COMPLETED es
   * isPaid y closeSession no deja cerrar con órdenes pendientes).
   */
  private calculateRevenue(groups: StatusGroup[]): ShiftRevenue {
    const isCounted = (r: StatusGroup) => r.status !== OrderStatus.CANCELLED;

    const paidRows = groups.filter((r) => r.isPaid && isCounted(r));
    const collected = paidRows.reduce((sum, r) => sum + (r._sum.totalAmount ?? 0n), 0n);
    const paidCount = paidRows.reduce((sum, r) => sum + r._count.id, 0);

    const pending = groups
      .filter((r) => !r.isPaid && isCounted(r))
      .reduce((sum, r) => sum + (r._sum.totalAmount ?? 0n), 0n);

    const averageTicket = paidCount > 0 ? collected / BigInt(paidCount) : 0n;

    return { collected, pending, averageTicket };
  }
```

- [ ] **Step 4: Reescribir el filtro de `buildPaymentMethods` por `isPaid`**

En `buildPaymentMethods`, reemplazar el JSDoc y el `.filter` (líneas 133-140) por:

```ts
  /**
   * Desglosa el dinero cobrado por método de pago. Incluye solo órdenes
   * pagadas (`isPaid`) no canceladas — misma regla que `collected`, de modo
   * que la suma de métodos cuadra con `revenue.collected` también en vivo.
   * Una orden con paymentMethod pero sin pagar (kiosk, o staff que lo asignó
   * antes del cobro) no representa dinero en caja y no se cuenta.
   */
  private buildPaymentMethods(groups: StatusGroup[]): ShiftStatsByPaymentMethod[] {
    const acc = groups
      .filter((row) => row.isPaid && row.status !== OrderStatus.CANCELLED && row.paymentMethod)
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `docker compose exec res-api-core pnpm test cash-register-stats.service.spec`
Expected: PASS (todos los tests del Task 1).

- [ ] **Step 6: Correr el suite de cash-register completo (no romper service.spec)**

Run: `docker compose exec res-api-core pnpm test cash-register`
Expected: PASS. Si `cash-register.service.spec.ts` o `cash-register.controller.spec.ts` referencian `revenue.completed`, actualizarlos a `collected` con el mismo valor esperado.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register-stats.service.ts apps/api-core/src/cash-register/cash-register-stats.service.spec.ts
git commit -m "feat(cash-register): revenue & payment breakdown by isPaid, not COMPLETED (R2-02)

Renombra revenue.completed -> collected; el dinero entrante se cuenta por
isPaid=true (excl. canceladas), reflejando el dinero real cobrado en vivo
durante el flujo de cobro en dos pasos."
```

---

## Task 4: Frontend — leer `collected`

**Files:**
- Modify: `apps/ui/src/components/dash/register/api.ts:35-39`
- Modify: `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx:91`
- Modify: `apps/ui/src/components/commons/ShiftSummaryView.tsx:17-21,174`

- [ ] **Step 1: Renombrar el campo en el tipo de la API de caja**

En `apps/ui/src/components/dash/register/api.ts`, reemplazar la interfaz `ShiftRevenue` (líneas 35-39):

```ts
export interface ShiftRevenue {
  collected: number;
  pending: number;
  averageTicket: number;
}
```

- [ ] **Step 2: Leer `collected` en el panel en vivo**

En `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx` línea 91, reemplazar:

```tsx
                  {formatCurrency(stats?.revenue.collected ?? 0)}
```

(La etiqueta "Ingresos" del `<p>` siguiente se mantiene; "Pendiente cobro" se mantiene.)

- [ ] **Step 3: Renombrar el campo en el tipo local de ShiftSummaryView**

En `apps/ui/src/components/commons/ShiftSummaryView.tsx`, reemplazar la interfaz `ShiftRevenueLike` (líneas 17-21):

```ts
interface ShiftRevenueLike {
  collected: number;
  pending: number;
  averageTicket: number;
}
```

- [ ] **Step 4: Leer `collected` en el resumen de cierre**

En `apps/ui/src/components/commons/ShiftSummaryView.tsx` línea 174, reemplazar:

```tsx
        <StatTile label="Total ingresado" value={formatCurrency(revenue.collected)} tone="success" />
```

- [ ] **Step 5: Verificar el typecheck de la UI**

Run: `docker compose exec res-ui pnpm build` (o `pnpm exec astro check` si está disponible)
Expected: sin errores de tipo por `revenue.completed`.
> Si el contenedor `res-ui` no está levantado, correr desde `apps/ui/`: `pnpm build`.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/components/dash/register/api.ts apps/ui/src/components/dash/orders/OrderStatsPanel.tsx apps/ui/src/components/commons/ShiftSummaryView.tsx
git commit -m "fix(ui): read revenue.collected in live stats & shift summary (R2-02)"
```

---

## Task 5: Docs `.info.md`

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md:310`
- Modify: `apps/api-core/src/cash-register/cash-register.module.info.md` (líneas 13, 56-58, 91-94, 186, 233-236, 252-253)

- [ ] **Step 1: Corregir el doc drift del auto-avance en orders**

En `orders.module.info.md`, reemplazar la línea 310:

```md
- Al marcar como pagada (`PATCH /:id/pay`), la orden **no** cambia de status: `isPaid` pasa a `true` pero el status se conserva (flujo de cobro en dos pasos). Avanzar `SERVED → COMPLETED` es un paso aparte que exige `isPaid=true`. Una orden puede quedar `SERVED + isPaid=true` (cobrada, pendiente de completar).
```

- [ ] **Step 2: Actualizar `cash-register.module.info.md` — línea 13**

Reemplazar:

```md
- `byPaymentMethod` refleja solo órdenes pagadas (`isPaid=true`), excluyendo canceladas.
```

- [ ] **Step 3: Actualizar el ejemplo JSON — líneas 56-58**

Reemplazar la clave `"completed"` dentro de `"revenue"` por `"collected"`:

```json
    "revenue": {
      "collected": 120.50,
      "pending": 45.00,
```

- [ ] **Step 4: Redefinir la semántica — líneas 91-94**

Reemplazar las cuatro líneas:

```md
- `revenue.collected` = sum(totalAmount) donde `isPaid = true` y status ≠ CANCELLED (dinero realmente cobrado, cualquier status).
- `revenue.pending` = sum(totalAmount) donde `isPaid = false` y status ≠ CANCELLED (comprometido, sin cobrar).
- `revenue.averageTicket` = `revenue.collected` / cantidad de órdenes pagadas; `0` si no hay pagadas.
- `byPaymentMethod` = solo órdenes pagadas (`isPaid = true`, excl. canceladas); el método de pago de una orden sin pagar no cuenta.
```

- [ ] **Step 5: Actualizar tablas de contrato — líneas 186, 233-236, 252-253**

Reemplazar línea 186:

```md
| `summary.revenue.collected` cuenta órdenes pagadas (`isPaid`) | 200 | `CANCELLED` excluidas |
```

Reemplazar líneas 233-236:

```md
| `revenue.collected` correcto | 200 | Suma órdenes pagadas (isPaid), excl. canceladas |
| `revenue.pending` correcto | 200 | Suma no pagadas, excl. canceladas |
| `revenue.averageTicket` con 0 pagadas | 200 | Retorna 0, sin dividir por cero |
| `byPaymentMethod` solo pagadas | 200 | Método de pago de no pagadas/canceladas no aparece |
```

Reemplazar líneas 252-253:

```md
| `summary.revenue.collected` cuenta órdenes pagadas (`isPaid`) | 200 | Convertido a pesos vía `fromCents` |
| `summary.byPaymentMethod` como array | 200 | Solo pagadas, `[{ method, count, total }]` |
```

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/orders/orders.module.info.md apps/api-core/src/cash-register/cash-register.module.info.md
git commit -m "docs(cash-register,orders): revenue-by-isPaid semantics + fix pay auto-advance drift (R2-02)"
```

---

## Task 6: Marcar R2-02 RESUELTO en el documento de hallazgos

**Files:**
- Modify: `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`

- [ ] **Step 1: Añadir el banner RESUELTO al encabezado de R2-02**

Justo debajo del título `### R2-02 — ...` (línea 104), insertar:

```md

> ✅ **RESUELTO (2026-06-07).** El reporte de caja cuenta el dinero entrante por `isPaid=true` (excl. canceladas), no por status `COMPLETED`. `revenue.completed` → `revenue.collected`; `averageTicket` y `byPaymentMethod` también por `isPaid`. Doc drift de auto-avance corregido en `orders.module.info.md`. Ver `docs/superpowers/specs/2026-06-07-orders-revenue-by-ispaid-design.md` y `docs/superpowers/plans/2026-06-07-orders-revenue-by-ispaid.md`. La descripción de abajo se conserva como registro del hallazgo original.
```

- [ ] **Step 2: Actualizar el estado global y el resumen ejecutivo**

En la línea 8 (`**Estado:**`), añadir tras la mención de R2-01: `R2-02 (MEDIO) RESUELTO el 2026-06-07.`

En la tabla del resumen ejecutivo (líneas 43-45), reemplazar:

```md
| 🟡 MEDIO | 4 | ~~R2-02~~ ✅ RESUELTO, R2-03, R2-04, R2-05 |
| 🟢 BAJO | 7 | R2-06, R2-07, R2-08, R2-09, R2-10, R2-11, R2-12 |
| **Total** | **12** (2 resueltos, 10 pendientes) | |
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md
git commit -m "docs(audit): mark R2-02 as RESOLVED in R2 findings"
```

---

## Task 7: Verificación final

- [ ] **Step 1: Suite de unit de la API**

Run: `docker compose exec res-api-core pnpm test cash-register`
Expected: PASS (todos los specs de cash-register).

- [ ] **Step 2: Confirmar que no quedan referencias a `revenue.completed` en UI ni en stats**

Run:
```bash
grep -rn "revenue.completed\|revenue\['completed'\]" apps/ui/src apps/api-core/src
```
Expected: sin resultados.

- [ ] **Step 3: Confirmar la equivalencia al cierre (lectura de código)**

Verificar que `cash-register.service.ts:74-78` (`closeSession`) sigue calculando `totalSales` como `Σ totalAmount WHERE status = COMPLETED` — **no se toca**. La equivalencia `collected == totalSales` al cierre se sostiene porque toda `COMPLETED` es `isPaid` y `closeSession` rechaza cerrar con órdenes pendientes.
Expected: `closeSession` sin cambios; nota de no-regresión confirmada.
```
