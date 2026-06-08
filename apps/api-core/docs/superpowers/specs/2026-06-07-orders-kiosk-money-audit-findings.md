# Auditoría R2 — Orders, Kiosk, Caja (dinero, totales, conversiones)

**Fecha:** 2026-06-07
**Ciclo:** Round 2 (sucesor de `2026-05-24-orders-cash-kitchen-audit-findings.md`)
**Foco declarado por el usuario:** flujo de **kiosk + órdenes**, con énfasis en **montos, totales y conversiones**, y la **corrección del reporte/cierre de caja** (si no cuadra, hay pérdida de dinero o información). Usuarios, permisos y reportes generales quedan fuera de foco salvo donde tocan dinero/órdenes.
**Módulos backend:** `orders`, `kiosk`, `cash-register` (stats + cierre), `restaurants` (settings de moneda).
**Módulos UI:** `dash/orders` (UI optimista React), `kiosk` (store), `dash/settings`, `commons/ShiftSummaryView`, `orders-history`.
**Estado:** Pendiente revisión punto por punto. **R2-01 (ALTO) RESUELTO** el 2026-06-07 — ver PR #142 y `docs/superpowers/plans/2026-06-07-orders-cancel-race-fix.md`. Resto pendiente. R2-02 (MEDIO) RESUELTO el 2026-06-07. R2-03 (MEDIO) RESUELTO el 2026-06-08.
**Tipo:** Audit findings (no implementación).

---

## Contexto

Re-evaluación de los flujos core de dinero tras dos cambios introducidos después del ciclo anterior:

1. **Módulo de settings de restaurante** (`/dash/settings`): define `currency`, `decimalSeparator`/`thousandsSeparator` (derivado) y `country`. Pensado para que cada restaurante muestre los montos con su convención local.
2. **Pantalla de órdenes migrada a UI optimista con React** (`OrdersPanel` + `OrderCard` + `OrderStatsPanel`): patches optimistas locales, flujo de cobro en dos pasos ("método" + "Cobrar"), stats en vivo.

Cada hallazgo trae ID estable (`R2-XX`), severidad, archivos exactos con línea, evidencia y fix sugerido. Los IDs `H-XX` referenciados pertenecen al spec del ciclo anterior.

### Re-verificación de fixes del ciclo anterior (siguen en pie)

| Hallazgo previo | Verificación 2026-06-07 | Estado |
|---|---|---|
| H-01 — kiosk precios en pesos | `kiosk.service.ts:138` aplica `fromCents(item.price ?? item.product.price)` | ✅ vigente |
| H-02 — dashboard dividía /100 | `OrderCard.tsx:95` usa `formatMoney` (ver R2-03 para el gap restante) | ✅ vigente |
| H-22 — serializer `fromCents` | `order.serializer.ts:45-48` convierte `totalAmount` | ✅ vigente |
| H-05/H-06/H-13 — concurrencia pay/unpay/kitchen | `transitionStatusIfMatches*` + `$transaction` en `orders.service.ts:183-324` | ✅ vigente |
| H-09 — lock de cashShift en createOrder | `lockShiftById` dentro de la TX (`orders.service.ts:68`) | ✅ vigente |
| Multi-tenant (H-08/H-12/H-20) | `orders.controller.ts` y `cash-register.controller.ts` derivan `restaurantId` del JWT | ✅ vigente |

**Gap pendiente del ciclo anterior que sube de severidad este ciclo:** el "known gap" documentado en `orders.module.info.md` (`cancelOrder` sin optimistic concurrency) se materializa como pérdida monetaria → ver **R2-01**. ✅ **Resuelto** (2026-06-07, PR #142): `cancelOrder` ya usa el patrón optimistic y el "known gap" fue eliminado de `orders.module.info.md`.

---

## Resumen ejecutivo

| Severidad | Cantidad | IDs |
|-----------|----------|-----|
| 🔴 CRÍTICO | 0 | — |
| 🟠 ALTO | 1 | ~~R2-01~~ ✅ RESUELTO (PR #142) |
| 🟡 MEDIO | 4 | ~~R2-02~~ ✅, ~~R2-03~~ ✅ RESUELTOS, R2-04, R2-05 |
| 🟢 BAJO | 7 | R2-06, R2-07, R2-08, R2-09, R2-10, R2-11, R2-12 |
| **Total** | **12** (3 resueltos, 9 pendientes) | |

> Nota de severidad: R2-02 y R2-03 tocan directamente la prioridad declarada (reporte de caja). Se mantienen en MEDIO porque **no corrompen el cierre final** (el cierre no se puede ejecutar con pendientes, y el descuadre de R2-02 se reconcilia al completar; R2-03 es solo display). R2-01 es el único con riesgo real de descuadre del total cerrado.

---

## 🟠 ALTO

### R2-01 — Race `pay` ‖ `cancel` deja `CANCELLED + isPaid=true`; el dinero cobrado desaparece del cierre

> ✅ **RESUELTO (2026-06-07, PR #142).** `cancelOrder` ahora corre dentro de una `$transaction` con la primitiva guardada `cancelOrderIfCancellable` (`UPDATE ... WHERE id=? AND restaurantId=? AND status=? AND isPaid=false`); si `count=0` re-lee y lanza el error preciso. Se eliminó el `cancelOrder` incondicional del repositorio. **Invariante garantizado:** una orden nunca queda `CANCELLED && isPaid=true`. Cubierto por unit tests (8 casos, incl. 3 de race) + e2e real-DB en `test/orders/raceConditions.e2e-spec.ts`. Ver `docs/superpowers/specs/2026-06-07-orders-cancel-race-fix-design.md` y `docs/superpowers/plans/2026-06-07-orders-cancel-race-fix.md`. La descripción de abajo se conserva como registro del hallazgo original.

**Categoría:** dinero · race condition · lógica
**Severidad:** 🟠 ALTO (probabilidad media en multi-pantalla; impacto: descuadre del total cerrado)
**Archivos:**
- `apps/api-core/src/orders/orders.service.ts:162-171` (`cancelOrder`)
- `apps/api-core/src/orders/order.repository.ts:131-138` (`cancelOrder` repo)
- `apps/api-core/src/orders/order-state-machine.ts` (`assertCanCancel`)
- Consumidores del total: `cash-register.service.ts:74-89` (`totalSales`), `cash-register-stats.service.ts:117-152` (`revenue`/`byPaymentMethod`)

**Descripción:**
`cancelOrder` valida con `assertCanCancel(order.status, order.isPaid)` sobre una lectura previa (`findById`) y luego ejecuta un `update` **incondicional** (`order.repository.ts:132`). No usa el patrón optimistic (`UPDATE ... WHERE status=? AND isPaid=?`) que sí protege a `markAsPaid`/`kitchenAdvanceStatus`/`unmarkAsPaid`.

Secuencia problemática (dos cajeros / dos pantallas sobre la misma orden):

```
T2  cancelOrder: findById → { status: SERVED, isPaid: false }   (lectura stale)
T1  markAsPaid:  COMMIT  → { isPaid: true }
T2  assertCanCancel(SERVED, isPaid=false) → pasa (usa lectura stale)
T2  repo.cancelOrder: UPDATE ... SET status=CANCELLED (incondicional) → COMMIT
    Resultado final: { status: CANCELLED, isPaid: true }
```

**Impacto monetario:**
- `revenue.completed`, `byPaymentMethod` y `totalSales` cuentan **solo** órdenes `COMPLETED` → la orden pagada+cancelada **no** aparece en ninguna cubeta de ingresos.
- Una orden `CANCELLED` **no** bloquea el cierre (`closeSession` solo bloquea CREATED/CONFIRMED/PROCESSING/SERVED, `cash-register.service.ts:59-72`). El turno cierra con dinero físico en caja que no figura en `totalSales` → **descuadre real**.

**Evidencia:**
```ts
// order.repository.ts:131-138 — update incondicional, sin guard de status/isPaid
async cancelOrder(id: string, reason: string) {
  const order = await this.prisma.order.update({
    where: { id },                                  // ← sin status/isPaid en el WHERE
    data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
    include: ORDER_WITH_ITEMS,
  });
  return new OrderSerializer(order);
}
```

**Fix sugerido:**
1. Extender el patrón optimistic a cancel: `cancelOrderIfCancellable(tx, id, restaurantId, expectedStatus)` con `UPDATE ... WHERE id=? AND restaurantId=? AND status=? AND isPaid=false`. Si `count=0` → relanzar `InvalidStatusTransition`/`CannotCancelPaidOrder`.
2. Envolver `cancelOrder` del service en `$transaction` con read + conditional update (igual que `markAsPaid`).
3. Test de regresión de concurrencia pay‖cancel (validar estado final imposible: nunca `CANCELLED && isPaid`).

---

## 🟡 MEDIO

### R2-02 — `markAsPaid` no auto-avanza SERVED→COMPLETED; el dinero cobrado se reporta como "Pendiente cobro"

> ✅ **RESUELTO (2026-06-07).** El reporte de caja cuenta el dinero entrante por `isPaid=true` (excl. canceladas), no por status `COMPLETED`. `revenue.completed` → `revenue.collected`; `averageTicket` y `byPaymentMethod` también por `isPaid`. Doc drift de auto-avance corregido en `orders.module.info.md`. Cubierto por unit + e2e de cash-register. Ver `docs/superpowers/specs/2026-06-07-orders-revenue-by-ispaid-design.md` y `docs/superpowers/plans/2026-06-07-orders-revenue-by-ispaid.md`. La descripción de abajo se conserva como registro del hallazgo original.

**Categoría:** lógica · reporte · doc drift
**Severidad:** 🟡 MEDIO (no corrompe el cierre final; engaña el reporte en vivo durante el turno)
**Archivos:**
- `apps/api-core/src/orders/orders.service.ts:224-270` (`markAsPaid`, `nextStatus = order.status`)
- `apps/api-core/src/orders/orders.module.info.md:310` (afirma auto-complete)
- `apps/api-core/src/cash-register/cash-register-stats.service.ts:102-131` (`calculateRevenue`)
- UI: `OrderStatsPanel.tsx:95-99` ("Pendiente cobro"), `commons/ShiftSummaryView.tsx:175`

**Descripción:**
El `module.info.md:310` afirma: *"Al marcar como pagada, si la orden está en estado SERVED, se auto-avanza automáticamente a COMPLETED"*. El código **ya no** lo hace — `markAsPaid` mantiene `nextStatus = order.status` (`orders.service.ts:248`). Esto es coherente con el nuevo flujo de cobro en dos pasos (commits `6b36969`, `be8ddc4`), así que el bug es **doc drift** + una **inconsistencia de cálculo** aguas abajo:

`calculateRevenue` clasifica el `pending` por **status** (todo lo que no es COMPLETED ni CANCELLED), no por `isPaid` (`cash-register-stats.service.ts:122-124`). Una orden `SERVED + isPaid=true` (dinero ya en caja) cae en `revenue.pending`, que la UI rotula **"Pendiente cobro"**. El cajero ve menos "Ingresos" de lo realmente cobrado mientras el turno está abierto.

> Al cierre se reconcilia: `closeSession` no permite cerrar con órdenes SERVED pendientes, así que el cajero debe completarlas y el total final cuadra. El problema es el **reporte en vivo**, no el cierre.

**Evidencia:**
```ts
// cash-register-stats.service.ts:122-124 — pending por status, ignora isPaid
const pendingRevenue = Object.entries(byStatus)
  .filter(([status]) => status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED)
  .reduce((sum, [, { revenue }]) => sum + revenue, 0n);
```

**Fix sugerido (elegir uno):**
- **(a) Restaurar auto-complete** en `markAsPaid` para SERVED → COMPLETED (revertir al contrato documentado). Riesgo: rompe el flujo de dos pasos si es intencional.
- **(b) Recalcular revenue por `isPaid`**: distinguir "cobrado" (`isPaid=true`, cualquier status no cancelado) de "pendiente de cobro" (`isPaid=false`). Renombrar las cubetas y actualizar `OrderStatsPanel`/`ShiftSummaryView`. **Recomendado** — alinea el reporte con la realidad sin tocar la máquina de estados.
- En ambos casos: corregir `orders.module.info.md:310`.

---

### R2-03 — Los reportes de caja ignoran los settings de moneda del restaurante

> ✅ **RESUELTO (2026-06-08).** Todas las superficies de dinero (dashboard, historial, caja, productos, menús, kiosk) usan la función compartida `formatMoney` con los separadores del restaurante. El kiosk los recibe vía el endpoint público `/status`; el `orders-history.astro` vía localStorage (espejo del timezone); el dashboard vía `useRestaurantSettings()`. Convención documentada en `apps/ui/docs/money-formatting.md`. Ver `apps/ui/docs/superpowers/specs/2026-06-08-money-format-unification-design.md` y su plan. La descripción de abajo se conserva como registro del hallazgo original.

**Categoría:** dinero · display · consistencia
**Severidad:** 🟡 MEDIO (no hay pérdida de dinero; el reporte de cierre se ve incorrecto para la convención local)
**Archivos:**
- `apps/ui/src/components/commons/ShiftSummaryView.tsx:83-85` (cierre de caja + detalle de historial)
- `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx:9-11` (stats en vivo, `en-US` hardcodeado)
- `apps/ui/src/pages/dash/orders-history.astro:113-114` (`toFixed(2)`)
- Referencia correcta: `apps/ui/src/lib/money.ts` (`formatMoney`) + `apps/ui/src/lib/restaurant-settings.ts` (`useRestaurantSettings`)

**Descripción:**
El módulo de settings expone `decimalSeparator`/`thousandsSeparator`/`currency` por restaurante, pero solo `OrderCard.tsx:95` los consume vía `formatMoney`. Los tres reportes de dinero más visibles los **ignoran**:

```ts
// ShiftSummaryView.tsx:83  → resumen de cierre y detalle de sesión
function formatCurrency(value) { return `$${Number(value).toFixed(2)}`; }   // siempre '.' decimal, sin miles

// OrderStatsPanel.tsx:9     → KPIs en vivo (Ingresos, Pendiente, Ticket promedio)
function formatCurrency(value) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;  // formato US
}

// orders-history.astro:114
function formatCurrency(value) { return `$${Number(value).toFixed(2)}`; }
```

Para un restaurante CLP (`decimalSeparator = ','`, `thousandsSeparator = '.'`) el cierre muestra `$1234.50` en vez de `$1.234,50`. El feature de settings está a medio cablear, justo en el reporte de cierre que es la prioridad.

**Fix sugerido:**
1. `ShiftSummaryView` y `OrderStatsPanel` (componentes React): consumir `useRestaurantSettings()` + `formatMoney(value, settings)`.
2. `orders-history.astro` (Astro estático): es la superficie más difícil porque corre fuera de React Query. Opciones: hidratar una isla React para la tabla, o pasar settings al script vía `define:vars` desde el `apiFetch` inicial. Documentar la decisión.
3. Test: snapshot de `formatMoney` con settings CL vs US ya existe en `money.test.ts`; agregar que los reportes lo usan.

---

### R2-04 — Acciones optimistas concurrentes sobre la misma orden se descartan en silencio

**Categoría:** lógica (frontend) · UX · riesgo operativo
**Severidad:** 🟡 MEDIO (el cajero puede creer que cobró/avanzó una orden que no se procesó)
**Archivos:**
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx:68-76` (`withOptimisticAction`)
- `apps/ui/src/components/dash/orders/OrderCard.tsx` (ya **no** recibe `inFlightIds`; commit `8842af1`)

**Descripción:**
`withOptimisticAction` descarta cualquier acción si el `id` ya está en `inFlightRef` (guard correcto contra doble-submit de la *misma* acción). Pero "Cobrar" (`onPay`), "Avanzar" (`onAdvance`) y "Completar" comparten el mismo `order.id`. Como el commit `8842af1` removió `inFlightIds` de `OrderCard`, los botones **no se deshabilitan** mientras hay una acción en vuelo, y la segunda acción se pierde **sin toast ni feedback visual**.

Escenario: el cajero toca "Cobrar" e inmediatamente "Completar" → el segundo click entra a `withOptimisticAction`, ve el id in-flight y hace `return` silencioso. El cajero ve la orden "pagada" (patch optimista) pero el "Completar" nunca ocurrió, o viceversa.

**Evidencia:**
```ts
// OrdersPanel.tsx:68-76
function withOptimisticAction(id, patch, fn) {
  if (inFlightRef.current.has(id)) return;   // ← descarte silencioso, sin feedback
  inFlightRef.current.add(id);
  ...
}
```

**Fix sugerido:**
- Dar feedback cuando se descarta: `showToast('Procesando el pedido, espera un momento…')` en el early-return, **o**
- Re-introducir el estado in-flight en `OrderCard` (deshabilitar botones + `aria-busy`) como tenía pre-`8842af1`, **o**
- Encolar la segunda acción tras el settle de la primera.

---

### R2-05 — `OrderStatsPanel.refresh()` se dispara en cada evento SSE → N refetch del endpoint de stats (groupBy pesado)

**Categoría:** rendimiento · arquitectura SSE
**Severidad:** 🟡 MEDIO (degradación a escala; reintroduce el patrón que H-AUX-02 eliminó)
**Archivos:**
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx:152, 160` (`statsPanelRef.current?.refresh()`)
- `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx:25-45` (`fetchStats` → `GET /v1/cash-register/stats`)
- Backend del endpoint: `cash-register-stats.service.ts:47-67` (`groupBy` + `getTopProductsWithNamesByShift`)

**Descripción:**
H-AUX-02 eliminó el patrón "N eventos SSE = N refetch completos" para la lista de órdenes (ahora se aplica patch local). Pero la UI optimista re-introdujo el mismo patrón para las stats: cada `order:new` y `order:updated` llama `statsPanelRef.current?.refresh()`, que hace `GET /v1/cash-register/stats` — un endpoint **más caro** (agregación `groupBy` multidimensional + top products con join de nombres). En hora pico, una ráfaga de N órdenes dispara N agregaciones por **cada cliente conectado** (dashboard + cajas). Sin debounce; refetches solapados → el último en resolver gana (puede pisar el más reciente).

**Evidencia:**
```ts
// OrdersPanel.tsx:144-161 — cada evento SSE dispara un fetch de stats además del patch local
const handleNew = (e) => { ...; statsPanelRef.current?.refresh(); };
const handleUpdated = (e) => { ...; statsPanelRef.current?.refresh(); };
```

**Fix sugerido:**
- Debounce/throttle del `refresh()` (p.ej. trailing 1–2 s) para colapsar ráfagas en un solo fetch, **o**
- Calcular las stats por patch local incremental (más complejo: hay que reconstruir `revenue`/`counts`/`byPaymentMethod` desde el delta), **o**
- Mantener el refetch solo en acciones del propio usuario + un intervalo de refresco perezoso, ignorando los eventos SSE de otros clientes para las stats.

---

## 🟢 BAJO

### R2-06 — `validateAndBuildItems` calcula montos con `Number` y aritmética flotante

**Categoría:** dinero · consistencia (latente)
**Severidad:** 🟢 BAJO (hoy seguro con centavos enteros; viola la convención y es bomba latente)
**Archivos:**
- `apps/api-core/src/orders/orders.service.ts:340` (`Number(product.price)`), `:349` (`unitPrice * quantity`), `:355` (`reduce(+)`)
- Regla violada: `apps/api-core/docs/money-conversion.md` ("nunca float; el dominio opera en BigInt")

**Descripción:**
`unitPrice = Number(product.price)`, `subtotal = unitPrice * item.quantity`, `totalAmount = sum(subtotal)` — todo en `Number` centavos. La convención del repo prohíbe pasar `price` como `number` y hacer aritmética flotante con dinero. Hoy es correcto (centavos enteros, precisos hasta 2^53), pero: (1) viola la regla documentada, y (2) `validateExpectedTotal` hace `BigInt(totalAmount)` (`orders.service.ts:372`), que lanzaría si el monto dejara de ser entero por cualquier cambio futuro.

**Fix sugerido:** Operar el flujo de creación en `bigint` (`product.price` ya es BigInt). Mantener `OrderItemEntry.unitPrice/subtotal` y `totalAmount` como `bigint` end-to-end; `createWithItems` ya escribe a columnas BigInt.

---

### R2-07 — `expectedTotal` del kiosk se calcula con float en pesos y se compara exacto contra centavos

**Categoría:** dinero · conversión
**Severidad:** 🟢 BAJO (seguro para monedas enteras; riesgo teórico para monedas con decimales y carritos grandes)
**Archivos:**
- `apps/ui/src/components/kiosk/store/kiosk.store.ts:304` (`cart.reduce((s, c) => s + c.price * c.quantity, 0)`)
- `apps/api-core/src/orders/dto/create-order.dto.ts:92-96` (`@Transform(toCents)`)
- `apps/api-core/src/orders/orders.service.ts:368-377` (`validateExpectedTotal`, comparación exacta)

**Descripción:**
El kiosk suma `price * quantity` en **pesos** (float) y envía `expectedTotal`. El DTO lo pasa a centavos con `toCents` (que hace `Math.round(amount * 100)`), y el backend compara **exactamente** `BigInt(totalAmount) !== expectedTotal`. El redondeo de `toCents` absorbe el error de punto flotante típico, pero para monedas con decimales (USD) y carritos con muchos ítems de precio fraccionario, el acumulado flotante podría cruzar el medio centavo y disparar un falso `400 "los precios han cambiado"`.

**Fix sugerido:** Calcular `expectedTotal` en el kiosk en centavos enteros (`Math.round(c.price * 100) * c.quantity`, sumado como entero) antes de enviar, o documentar explícitamente que la tolerancia es 0 y aceptar el riesgo para CLP/UYU (enteros).

---

### R2-08 — `MenuItem` no tiene columnas `price`/`stock` pero el código las lee; CLAUDE.md/info afirman que hay overrides

**Categoría:** lógica · feature gap · doc drift
**Severidad:** 🟢 BAJO/MEDIO (los overrides de menú son imposibles en silencio)
**Archivos:**
- `prisma/schema.postgresql.prisma` (`model MenuItem` — sin `price` ni `stock`)
- `apps/api-core/src/kiosk/kiosk.service.ts:135` (`item.stock ?? item.product.stock`), `:138` (`item.price ?? item.product.price`)
- `CLAUDE.md` ("MenuItem (pivot with optional price/stock overrides)") y `kiosk.module.info.md`

**Descripción:**
El schema de `MenuItem` solo tiene `sectionName` y `order` — **no** existen `price` ni `stock`. El código del kiosk lee `item.price`/`item.stock` (siempre `undefined`) y cae al fallback del producto. Resultado: los overrides de precio/stock por menú (p.ej. happy hour, precio distinto del mismo producto en dos menús) son **imposibles**, aunque CLAUDE.md y la doc del módulo afirman que existen. Es referencia a columnas inexistentes + drift de documentación. La creación de orden (`orders.service.ts:340`) también usa siempre `product.price`, así que es consistente con el cobro — pero contradice el diseño documentado.

**Fix sugerido:** Decidir el rumbo del producto:
- Si los overrides **no** son necesarios: borrar las referencias `item.price ?? ...` / `item.stock ?? ...` y corregir CLAUDE.md + `kiosk.module.info.md`.
- Si **sí** se quieren: agregar `priceOverride BigInt?` / `stockOverride Int?` a `MenuItem`, exponerlos en el kiosk y respetarlos en `validateAndBuildItems` (con su propia validación de `expectedTotal`).

---

### R2-09 — Etiquetas del selector "Formato decimal" confusas

**Categoría:** UX (frontend)
**Severidad:** 🟢 BAJO
**Archivos:**
- `apps/ui/src/components/dash/RestaurantSettingsForm.tsx:155-162`

**Descripción:**
```tsx
<input type="radio" value="," ... /> <span>Punto (1.234,56)</span>   // value=',' rotulado "Punto"
<input type="radio" value="." ... /> <span>Coma (1,234.56)</span>    // value='.' rotulado "Coma"
```
La palabra ("Punto"/"Coma") describe el **separador de miles**, no el decimal, mientras el control se titula "Formato decimal". El ejemplo numérico sí es correcto y coincide con el valor (el backend deriva el `thousandsSeparator` complementario en `restaurants.service.ts:83-85`), así que **no hay bug de datos** — solo riesgo de que un ADMIN elija el formato equivocado por la etiqueta engañosa.

**Fix sugerido:** Rotular por el separador decimal real ("Coma decimal: 1.234,56" / "Punto decimal: 1,234.56") o mostrar solo el ejemplo.

---

### R2-10 — Los decimales fijos a 2 ignoran la cantidad de decimales de la moneda

**Categoría:** dinero · display
**Severidad:** 🟢 BAJO
**Archivos:**
- `apps/ui/src/lib/money.ts` (`toFixed(2)` fijo)
- `prisma/schema.postgresql.prisma` (comentario: "Amounts are always rendered with 2 decimal places")
- `apps/api-core/src/common/helpers/money.ts` (`toCents`/`fromCents` con factor 100 fijo)

**Descripción:**
`currency` es configurable pero los decimales están fijos a 2 en todo el stack (display y `toCents`/`fromCents` ×100). Para monedas sin decimales (CLP, JPY) los montos muestran `,00`/`.00` siempre y se almacenan "centavos" inflados ×100 que no corresponden a una unidad real. Es consistente internamente (entra y sale igual), así que no hay pérdida; es una rareza de display y una suposición a documentar.

**Fix sugerido:** Documentar la suposición "siempre 2 decimales internos" en `money-conversion.md`, o mapear decimales por `currency` (ISO 4217 minor units) si se quiere precisión visual por moneda.

---

### R2-11 — El stock no se restaura al cancelar una orden

**Categoría:** stock · lógica (decisión consciente previa)
**Severidad:** 🟢 BAJO (re-confirmar)
**Archivos:**
- `apps/api-core/src/orders/orders.service.ts:162-171` (`cancelOrder` — no toca stock)
- `apps/api-core/src/orders/orders.service.ts:379-406` (`decrementAllStock`)

**Descripción:**
Al crear la orden se decrementa el stock atómicamente; al cancelar **no** se restaura (documentado como decisión consciente en el ciclo anterior, H-42). Consecuencia para el kiosk: una orden cancelada reduce el stock visible de forma permanente, pudiendo mostrar "agotado" cuando hay producto físico. Se re-anota para reconfirmar si sigue siendo aceptable con el volumen actual del kiosk.

**Fix sugerido (si se decide cambiar):** Restaurar stock dentro de la misma TX de cancelación (solo para órdenes que decrementaron stock, es decir productos con `stock !== null`), con cuidado de no restaurar dos veces (idempotencia vía el guard optimista de R2-01).

---

### R2-12 — `GET /kiosk/:slug/orders/:orderId` no valida pertenencia al restaurante del slug

**Categoría:** seguridad (IDOR by-design)
**Severidad:** 🟢 BAJO (UUID no adivinable; documentado como intencional)
**Archivos:**
- `apps/api-core/src/kiosk/kiosk.controller.ts` (endpoint público de estado de orden)
- `apps/api-core/src/kiosk/kiosk.module.info.md:202` (documentado como intencional)

**Descripción:**
El endpoint público de estado de orden resuelve el restaurante por slug pero **no** valida que el `orderId` pertenezca a ese restaurante (documentado como intencional para simplificar el polling). Quien conozca/adivine un `orderId` (UUID v4, no enumerable) podría leer `status`, `totalAmount` e `items` de una orden de otro restaurante. Riesgo bajo por la entropía del UUID, pero es un IDOR by-design sobre datos de pedido.

**Fix sugerido:** Filtrar por `restaurantId` del slug resuelto en la query del estado de orden (`where: { id: orderId, restaurantId }`) y devolver 404 si no coincide. Coste casi nulo, cierra el vector.

---

## Apéndice — Notas que NO son hallazgos (verificadas y descartadas)

- **Colisión de separadores** (decimal `.` + miles `.`): **descartado**. `restaurants.service.ts:83-85` deriva el `thousandsSeparator` complementario al cambiar el `decimalSeparator`, y el PATCH devuelve ambos; la UI los persiste. No hay colisión.
- **Totales del cierre (`closeSession`)**: **correctos**. `totalSales = Σ totalAmount(COMPLETED)`; toda orden `COMPLETED` es necesariamente `isPaid` (`assertCanComplete` exige `isPaid`), y `assertCanCancel` exige `!isPaid`, así que no hay pagados+cancelados por la vía normal (la única vía es la race R2-01). `revenue.completed == totalSales == Σ byPaymentMethod.total`.
- **`averageTicket` floor division** (H-30): documentado y aceptado en el ciclo anterior; sin cambios.
- **`closedSummaryCache` en memoria** (`cash-register.service.ts:20,150-156`): cachea summaries de turnos cerrados (inmutables), cap 200. En multi-réplica cada proceso tiene su copia, pero al ser inmutable no hay incoherencia observable. No es hallazgo.
- **Multi-tenant en controllers**: `restaurantId` siempre del JWT (orders, cash-register). Sin regresión.
