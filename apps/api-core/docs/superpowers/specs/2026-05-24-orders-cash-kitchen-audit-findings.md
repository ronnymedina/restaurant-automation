# Auditoría — Orders, Cash Register/Shift, Kitchen (Backend + UI)

**Fecha:** 2026-05-24
**Módulos backend:** `orders`, `cash-register`, `cash-shift`, `kitchen`, `kiosk` (consumidor)
**Módulos UI:** `dash/orders`, `kiosk`, `kitchen` page
**Estado:** Pendiente revisión punto por punto
**Tipo:** Audit findings (no implementación)

---

## Contexto

Auditoría exhaustiva de los módulos core de la plataforma (ciclo de vida de órdenes, caja, KDS, kiosk) buscando:
1. Errores y bugs reales
2. Inconsistencias lógicas
3. Inconsistencias en conversión de montos (ver `apps/api-core/docs/money-conversion.md`)
4. Vulnerabilidades

Cada hallazgo trae ID estable (`H-XX`) para referenciarse en discusión, severidad, archivos exactos, evidencia y fix sugerido. Los CRÍTICOS fueron verificados manualmente contra el código.

---

## Resumen ejecutivo

| Severidad | Cantidad | IDs |
|-----------|----------|-----|
| 🔴 CRÍTICO | 4 | H-01 ✅, H-02 ✅, H-03 ✅, H-04 ⏳ |
| 🟠 ALTO    | 16 | H-05 ✅, H-06 ✅, H-07 ✅, H-08 ✅, H-09 ✅, H-10 ✅, H-11 ✅, H-12 ✅, H-13 ✅, H-14 ✅, H-15 ✅, H-16 ✅, H-17 ✅, H-18 ✅, H-19 ❌, H-20 ✅ |
| 🟡 MEDIO   | 19 | H-21 ✅, H-22 ✅, H-23 ✅, H-24 🔄, H-25 ✅, H-26 ✅, H-27 ✅, H-28 ✅, H-29 ✅, H-30 ✅, H-31 ✅, H-32 ✅, H-33 ✅, H-34 ✅, H-35 ✅, H-36 ✅, H-37 ✅, H-38 ✅, H-39 🔄 |
| 🟢 BAJO    | 13 | H-40 … H-52 |
| **Total**  | **52** | |

**Progreso:**
- ✅ H-01 implementado (2026-05-25)
- ✅ H-02 implementado (2026-05-25) — fix del wizard + nuevas columnas de display settings + endpoint extendido
- ✅ H-03 implementado (2026-05-25) — XSS de cocina cerrado vía DOM API + módulo de recibo (dashboard + backend) eliminado por ser dead code + `@MaxLength` en campos de texto libre del DTO de orden
- ✅ H-22 parcial (2026-05-25) — `fromCents` aplicado en `serializeOrder`; refactor estructural a Serializer dedicado sigue pendiente
- ✅ H-05, H-06, H-09, H-13, H-14 implementados (2026-05-27) — race conditions de order/cash-shift transitions (markAsPaid, unmarkAsPaid, createOrder, closeSession, kitchenAdvanceStatus) y hardening del kitchen token (hash sha256 + timingSafeEqual + header X-Kitchen-Token). Ver `2026-05-27-orders-cashshift-kitchen-token-hardening-design.md` y plan asociado.
- ✅ H-07, H-08, H-11, H-12, H-15 implementados (2026-05-28) — `FindHistoryDto` con tope de 90 días y `limit ≤ 100`; defensa en profundidad por `restaurantId` en `OrderShiftReportRepository` + `CashRegisterStatsService` + `CashRegisterService.getSessionSummary` (404 cross-tenant); eliminación de `CashShiftRepository.close` (0 callers, firma con `totalSales: number` rompía convención BigInt); eliminación del feature `notifyOffline` (dead-end — emitía a un canal sin listener UI). Ver `2026-05-28-orders-cashshift-kitchen-hardening-batch2-design.md` y plan asociado.
- ⏳ H-04 deferred (2026-05-27) — scope acotado a "esta semana"; requiere diseño separado del mecanismo sse-ticket y refactor del cliente SSE (dashboard + cocina). Tracker como follow-up.
- ❌ H-19 descartado (2026-05-28) — el módulo de recibo del dashboard se borró completamente en H-03 (dead code + XSS cleanup). No hay código que arreglar.
- ➕ Hallazgo adicional descubierto y arreglado: contrato roto entre backend `/cash-register/summary` y frontend `RegisterHistoryIsland`. Ver sección "Hallazgos adicionales".
- ➕ Hallazgo adicional descubierto (2026-05-28): patrón SSE → full refetch en dashboard y cocina. N eventos = N refetches completos. Ver H-AUX-02 en "Hallazgos adicionales".
- ✅ H-10, H-16, H-17, H-18, H-20 implementados (2026-05-28) — batch 3 ALTOS: `closedBy` requerido en `closeSession`, clase `OrderStateMachine` centraliza transiciones, SSE no reconecta en filter change, doble submit bloqueado en OrderCard (con propagación a Kanban + FilteredList), multi-tenant invariant documentada. Ver plan `2026-05-28-orders-cashshift-kitchen-altos-plan.md`.
- ✅ H-21, H-22 (completo), H-23, H-25, H-26, H-27, H-28, H-29, H-30, H-31, H-32, H-33, H-34, H-35, H-36, H-37, H-38 implementados (2026-05-29) — batch de MEDIOS dividido en 4 commits independientes. Ver plan `2026-05-29-orders-cashshift-kitchen-medios-plan.md`.
- 🔄 H-24 documentado como decisión consciente (2026-05-29). Se mantiene `409 NO_OPEN_CASH_REGISTER` en `listOrders` por diseño del dashboard; órdenes huérfanas son visibles vía `/orders/history`.
- 🔄 H-39 diferido (2026-05-29). `apps/ui` corre con Astro `output: 'static'` sin adapter, por lo que `prerender = false` per-page rompe el build. Requiere migración a `hybrid`/`server` con adapter (decisión arquitectónica fuera del scope del batch de MEDIOS). Mitigación temporal: la auth del dashboard se enforza client-side por `apiFetch` (redirige a `/login` en 401), así que el bundle pre-renderizado no expone datos sensibles, solo estructura.

---

## Hallazgos adicionales (descubiertos durante la revisión)

### H-AUX-01 — Contrato roto entre `/v1/cash-register/{summary,close,stats}` y el frontend

**Categoría:** lógica · contrato API
**Severidad:** 🔴 CRÍTICO (rompía la UI del historial de caja)
**Estado:** ✅ Implementado (2026-05-25)

**Descripción:** al abrir el modal de detalle de una sesión cerrada en `/dash/register-history`, el frontend reventaba con `TypeError: Cannot read properties of undefined (reading 'completed')` en `RegisterHistoryIsland.tsx:159`.

La causa raíz: un refactor previo del backend había cambiado **silenciosamente** el contrato del endpoint `/cash-register/summary/:sessionId`:
- Antes: `{ session, summary: { completed:{count,total}, cancelled:{count}, paymentBreakdown } }` (lo que el frontend y los e2e originales asumían).
- Después: `{ session, stats: { counts: [{status, total: <count>}], revenue, byPaymentMethod, ... } }` (lo que el código devolvía).

Además había 3 shapes documentados en `info.md` (uno por endpoint: close, summary, stats) pero el código implementaba uno solo y lo reutilizaba en los 3, ignorando la documentación. Y la palabra `total` se usaba con dos significados distintos en el mismo objeto (count de órdenes y monto en dinero), lo que facilitó el drift.

**Cambios aplicados (camino B — contrato unificado):**

Backend:
- `cash-register-stats.service.ts` — interface `ShiftStats` → `ShiftSummary`. Método `getStats()` → `getSummary()`. `counts` ahora es objeto plano `{total, pending, created, confirmed, processing, served, completed, cancelled}` (antes era array `[{status, total}]`).
- `serializers/cash-register-stats.serializer.ts` — nuevo `ShiftSummarySerializer` y `ShiftCountsSerializer`.
- `cash-register.controller.ts` — `/close`, `/summary/:id` y `/stats` devuelven todos `{ summary }` (o `{ session, summary }`).
- `cash-register.service.ts` — `closeSession` retorna `{ session, summary }`. `getSessionStats` → `getSessionSummary`.
- `dto/cash-register-response.dto.ts` — DTOs unificados, sin más shapes divergentes.
- Specs unit + e2e actualizados al nuevo contrato.

Frontend:
- `api.ts` — tipo `ShiftSummary` unificado. Eliminados `CloseSummary` y `SessionDetailSummary`.
- `RegisterHistoryIsland.tsx`, `RegisterSummaryModal.tsx`, `RegisterPanel.tsx` — todos consumen `summary.counts.*`, `summary.revenue.*`, `summary.byPaymentMethod`.

Naming rules nuevas (clave para evitar el drift futuro):
- `count` siempre es número de órdenes (entero).
- `total` solo es dinero en `byPaymentMethod[].total` y `topProducts[].total`.
- Sin más `stats.total` ambiguo a nivel raíz; sin más `counts[].total` que significaba count.

Documentación: `cash-register.module.info.md` reescrito con el nuevo contrato.

**Verificación:** 38 unit tests + 45 e2e cash-register en verde. Smoke test manual confirmado por el usuario (`summary.revenue.completed = 125` para la orden de prueba $100 + $25).

---

### H-AUX-02 — Patrón SSE → full refetch (N eventos = N fetches completos)

**Categoría:** rendimiento · arquitectura SSE
**Severidad:** 🟠 ALTO (degradación a escala — un kiosk con tráfico pico dispara N×fetch en el dashboard y cocina)
**Estado:** ⏳ Pendiente

**Descripción:** El backend emite eventos SSE con **payload vacío** (`{}`), y los dos clientes que escuchan (dashboard + cocina) usan cada evento como señal de "algo cambió" y disparan un fetch REST completo de la lista de órdenes. No hay reconciliación local con el delta.

**Evidencia:**

Backend — el `_order` recibido se descarta:
```ts
// apps/api-core/src/events/orders.events.ts:14-22
emitOrderCreated(restaurantId: string, _order: Order): void {
  this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, {});  // ← payload vacío
  this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, {});
}
emitOrderUpdated(restaurantId: string, _order: Order): void {
  this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, {});
  this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, {});
}
```

Dashboard — refetch completo en cada evento:
```tsx
// apps/ui/src/components/dash/orders/OrdersPanel.tsx:90-94
const reload = () => {
  if (!activeFilter) fetchOrders(null);  // ← GET /v1/orders?limit=100
};
es.addEventListener(ORDER_EVENTS.NEW, reload);
es.addEventListener(ORDER_EVENTS.UPDATED, reload);
```

Cocina — mismo patrón:
```ts
// apps/ui/src/pages/kitchen/index.astro:374-375
es.addEventListener(ORDER_EVENTS.NEW, () => loadOrders());
es.addEventListener(ORDER_EVENTS.UPDATED, () => loadOrders());
```

**Impacto a escala:**
- 100 órdenes nuevas en ráfaga (rush hour de un kiosk) → 100 eventos → 100 `GET /v1/orders?limit=100` desde **cada cliente conectado** (dashboard + cocinas). En un restaurante con 3 pantallas, son 300 requests + 300 serializaciones backend para mostrar lo mismo.
- Latencia visible: cada cambio requiere 2 round-trips (SSE + REST).
- Coste de ancho de banda: el payload de 100 órdenes serializadas se transfiere repetidamente cuando bastaba con el delta de 1.
- Race sutil: si 2 eventos llegan en <100ms, dispara 2 fetches solapados; el último en resolver gana (puede pisar el más reciente si el orden de resolución difiere del orden de emisión).

**Fix propuesto:**

1. **Backend** (`orders.events.ts`): emitir el payload de la orden serializada. Reutilizar el serializer existente (`serializeOrder` para dashboard, `KitchenOrderSerializer` para cocina) para garantizar que los montos viajen en pesos y que campos sensibles queden excluidos. Auditar que multi-tenant ya está garantizado (cada cliente solo recibe eventos de su `restaurantId`, vía `SseService.emitToRestaurant`).

2. **Dashboard** (`OrdersPanel.tsx`): parsear `e.data` y hacer patch local con `setOrders`:
   ```tsx
   es.addEventListener(ORDER_EVENTS.NEW, (e) => {
     const order = JSON.parse(e.data) as Order;
     setOrders((prev) => [order, ...prev]);
   });
   es.addEventListener(ORDER_EVENTS.UPDATED, (e) => {
     const order = JSON.parse(e.data) as Order;
     setOrders((prev) => prev.map((o) => o.id === order.id ? order : o));
   });
   ```

3. **Cocina** (`kitchen/index.astro`): mismo patrón con `renderCard(order)` + `replaceChildren` del nodo correspondiente.

4. **Fallback a refetch completo**: mantener `loadOrders()` para la conexión inicial y reconexión (cuando `es.onopen` dispara). Así un cliente que estuvo offline durante eventos vuelve a estado consistente.

**Trade-offs:**
- ✅ Reduce N requests por ráfaga a 0 (solo el evento SSE original).
- ✅ Latencia visible ≈ latencia del SSE (1 round-trip menos).
- ⚠️ Si se pierde un evento (red intermitente), el cliente queda desincronizado hasta la siguiente reconexión. Mitigable agregando un evento periódico de heartbeat con timestamp para que el cliente detecte gaps y refetchee.
- ⚠️ Cambia el contrato del SSE — requiere coordinar deploy del backend antes del frontend, o feature flag.

**Relacionado:** [[H-17]] (reconexión SSE en cambio de filtro) trabaja la misma superficie de código. Implementar H-17 primero (incluido en el spec actual de ALTOS 2026-05-28), después abordar H-AUX-02 como spec separado.

---

## 🔴 CRÍTICOS

### H-01 — `validateExpectedTotal` compara pesos contra centavos (kiosk debería estar roto)

**Categoría:** dinero · lógica
**Archivos:**
- `apps/api-core/src/orders/orders.service.ts:287-293`
- `apps/api-core/src/orders/orders.service.ts:259`
- `apps/api-core/src/orders/dto/create-order.dto.ts:79-82`
- `apps/ui/src/components/kiosk/store/kiosk.store.ts:304`
- `apps/api-core/src/kiosk/kiosk.service.ts:73`

**Descripción:** El kiosk calcula `expectedTotal` sumando `price * quantity` con `price` en **pesos** (porque `ProductListSerializer`/`KioskMenuItem` aplican `fromCents`). El backend en `createOrder` calcula `totalAmount = Number(product.price) * quantity` con `product.price` en **centavos** (BigInt). La comparación `Math.abs(2500 - 25) > 0.01` siempre dispara.

**Evidencia:**
```ts
// orders.service.ts
const unitPrice = Number(product.price);  // centavos
...
if (Math.abs(totalAmount - expectedTotal) > 0.01) { throw ... }

// dto/create-order.dto.ts
@IsNumber() @IsOptional() expectedTotal?: number;  // sin @Transform(toCents)

// kiosk.store.ts (compilado en dist también)
expectedTotal: cart.reduce((s, c) => s + c.price * c.quantity, 0)
```

**Fix:**
1. Aplicar `@Transform(({ value }) => typeof value === 'number' ? toCents(value) : value)` al campo `expectedTotal` del DTO.
2. Tipar `expectedTotal` como `bigint` en service + comparar `bigint === bigint` (tolerancia 0n).
3. Eliminar `Number(product.price)`; mantener BigInt todo el flujo.

**Verificación previa:** Confirmar en logs/Sentry si los `POST /v1/kiosk/:slug/orders` están devolviendo 400 con código `EXPECTED_TOTAL_MISMATCH`. Si no, hay un path que estoy perdiendo.

**Estado:** ✅ Implementado (2026-05-25)

**Diagnóstico corregido:** la auditoría original suponía que el endpoint del kiosk devolvía pesos (igual que `ProductListSerializer`), y por eso predecía 400. La verificación mostró que el endpoint del kiosk (`kiosk.service.ts:135`) **tampoco** aplicaba `fromCents` — devolvía centavos crudos. Por eso ambos lados de `validateExpectedTotal` usaban la misma escala incorrecta y la validación pasaba "por accidente". Lo que el cliente veía en pantalla eran precios **inflados 100×** (ej: $10000 para un producto de $100), y aceptaba pagar ese monto creyendo que era correcto.

Verificación visual confirmada en local:
- Producto "Demo testing 2" en BD: `price = 10000n` centavos = $100.
- Dashboard mostraba: $100.00 ✅
- Kiosk mostraba (antes del fix): $10000.00 ❌

**Cambios aplicados:**
- `apps/api-core/src/kiosk/kiosk.service.ts:138` — aplicar `fromCents(item.price ?? item.product.price)` (antes: `Number(...)` crudo).
- `apps/api-core/src/orders/dto/create-order.dto.ts:79-89` — `expectedTotal` ahora es `bigint` con `@Transform(toCents)`, `@IsBigInt()`, `@MinBigInt(0n)`. El cliente envía pesos (number); el backend lo trata como centavos internamente.
- `apps/api-core/src/orders/orders.service.ts:287-295` — `validateExpectedTotal` compara `BigInt(totalAmount) !== expectedTotal` exactamente, sin tolerancia de coma flotante.
- Tests regression: `kiosk.service.spec.ts` (test "applies fromCents to product.price"), `kioskMenuItems.e2e-spec.ts` (test "Precio devuelto en pesos, no en centavos"), `kioskCreateOrder.e2e-spec.ts` (2 tests para `expectedTotal` válido/inválido en pesos).
- Documentación: `kiosk.module.info.md` y `orders.module.info.md` actualizados con el contrato de precios y la regla de naming.

**Verificación:** 420 unit tests del backend en verde (1 más que antes — regression test). E2e de `orders` (incluido `createOrderFromDashboard`) y `cash-register` también en verde — el cambio al DTO no rompió flujos existentes.

**Caveat conocido:** los e2e del módulo `kiosk` tienen un bug preexistente de setup (stack overflow al inicializar NestJS con SQLite vía `prisma db push`). No relacionado con este fix — confirmado con `git stash`. Pendiente como deuda técnica separada.

---

### H-02 — Frontend dashboard divide precios entre 100 (cajero ve $3.00 donde el real es $300)

**Categoría:** dinero · UX
**Archivos:**
- `apps/ui/src/components/dash/orders/CreateOrderStep1.tsx:31, 101, 113`
- `apps/ui/src/components/dash/orders/CreateOrderStep3.tsx:178, 183`
- `apps/api-core/src/products/serializers/product-list.serializer.ts:33` (referencia: ya aplica `fromCents`)

**Descripción:** El backend devuelve `price` en pesos (verificado en `ProductListSerializer`). El wizard de creación de orden lo trata como centavos y divide entre 100. El cajero confirma totales 100× menores; el backend cobra el monto correcto (sin `expectedTotal`), pero el comprobante visual está mal.

**Evidencia:**
```tsx
// CreateOrderStep1.tsx
<p>${(product.price / 100).toFixed(2)}</p>
<span>${((item.price * item.quantity) / 100).toFixed(2)}</span>
<span>${(total / 100).toFixed(2)}</span>
```

**Fix:** Eliminar `/100` en los 5 puntos. Usar `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' })` para evitar futuros errores de formato.

**Estado:** ✅ Implementado (2026-05-25)

**Diagnóstico corregido durante la revisión:** la auditoría apuntó al listado de productos del dashboard, pero la verificación visual mostró que **el listado de productos en `/dash/products` muestra los precios correctos** ($23.03, $100.00, $25.00). Es decir, `ProductsIsland.tsx` consume `ProductListSerializer.price` (ya en pesos) sin dividir entre 100. El bug `/100` solo aplicaba al **wizard de creación manual de orden** (`CreateOrderStep1.tsx:31, 101, 113` y `CreateOrderStep3.tsx:178, 183`).

**Cambios aplicados:**

Backend:
- `prisma/schema.postgresql.prisma` y `prisma/schema.prisma` — `RestaurantSettings` gana 4 columnas: `country` (default `CL`), `currency` (default `CLP`), `decimalSeparator` (default `,`), `thousandsSeparator` (default `.`). Permite que cada restaurante use el formato monetario de su país sin tocar código.
- Migración: `20260525162458_add_display_settings_to_restaurant_settings`.
- `restaurants/dto/restaurant-settings.dto.ts` — nuevo DTO + constante `DEFAULT_RESTAURANT_SETTINGS` única fuente de verdad para fallback.
- `GET /v1/restaurants/settings` ahora retorna también `country`, `currency`, `decimalSeparator`, `thousandsSeparator` (además de `timezone`). Si no hay fila de settings, devuelve los defaults de Chile.
- Spec actualizado: `restaurants.controller.spec.ts` cubre los 5 campos.

Frontend:
- `lib/money.ts` — helper `formatMoney(amount, settings)` que aplica 2 decimales fijos + separadores configurables, con guardas para NaN/Infinity y signo negativo correcto (`-$25,00` no `$-25,00`). Tests: 8 casos cubriendo CL, MX, redondeo, negativos, millones, defaults.
- `lib/restaurant-settings.ts` — hook `useRestaurantSettings()` basado en React Query con `staleTime: Infinity` e `initialData` para render síncrono sin flash.
- `CreateOrderStep1.tsx:31, 101, 113` — los 3 puntos ahora usan `formatPrice(...)` sin `/100`.
- `CreateOrderStep3.tsx:178, 183` — idem en el resumen.

Naming rule confirmada para la UI: los precios viajan **siempre en pesos** desde el backend (vía `fromCents`); la UI nunca debe dividir entre 100. Si necesita formato monetario, usa `formatMoney` + `useRestaurantSettings`.

**Verificación:** 8 unit tests de `money.test.ts` en verde; 7 unit tests de restaurants (controller + timezone) en verde tras regenerar Prisma client. Pendiente smoke test visual del wizard.

**Lo que sigue pendiente (H-38, otro PR):** aplicar `formatMoney` en `OrderCard.tsx:77` y `OrdersPanel.tsx:184, 186` (que hoy muestran montos correctos pero con `toFixed(2)` sin separadores). Mantenerlo separado para no mezclar scope.

---

### H-03 — XSS en impresión de recibo (dashboard) y `renderCard` (cocina)

**Categoría:** seguridad
**Archivos:**
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx:176-189`
- `apps/ui/src/pages/kitchen/index.astro:240-267, 340-341`

**Descripción:** `handleReceipt` arma HTML con `document.write` concatenando `restaurantName`, `productName`, `notes`, `paymentMethod` sin escape. La cocina hace `innerHTML = …${notes}…`. El kiosk acepta `notes` libres de clientes anónimos → vector XSS contra cajero y cocina, ambos con token JWT activo en storage.

**Evidencia:**
```ts
// OrdersPanel.tsx
win.document.write(`<html>…<h2>${receipt.restaurantName}</h2>
  ${(receipt.items ?? []).map(i => `<tr><td>${i.productName}</td>…${i.notes ? `<tr><td>${i.notes}</td></tr>` : ''}`)}…`);

// kitchen/index.astro
const note = i.notes ? `<p>${i.notes}</p>` : '';
colCreated.innerHTML = created.length ? created.map(renderCard).join('') : empty;
```

**Fix:** Reemplazar concatenación por `document.createElement` + `textContent`. Aplicar a `productName`, `notes`, `cancellationReason`, `restaurantName`, `paymentMethod`, `orderNumber`. La ventana de recibo debe abrirse con `rel="noopener"`.

**Estado:** ✅ Implementado (2026-05-25)

**Diagnóstico corregido durante la revisión:** la auditoría apuntó a 2 superficies (recibo del dashboard + cocina). Verificación en código:
- **Recibo del dashboard**: `handleReceipt` estaba cableado en `OrdersPanel.tsx` y `OrderCard.tsx` declaraba la prop `onReceipt`, pero **no existía botón en el JSX que lo invocara**. Era código muerto. Decisión: borrar todo el módulo de recibo (frontend + backend) porque no se va a usar en el corto plazo.
- **Cocina**: el XSS sí estaba 100% vivo. `renderCard` concatenaba `notes`, `productName` y `orderNumber` en un template string que luego se asignaba a `innerHTML`. Vector remoto sin auth (kiosk público acepta `notes` libre sin validación) → todas las pantallas de cocina conectadas ejecutan JS arbitrario en cuanto SSE entrega el pedido → token de cocina exfiltrable desde `sessionStorage` (combina con [[H-14]] para escalar a control total del KDS).

**Cambios aplicados (A + C):**

A — Cocina (`apps/ui/src/pages/kitchen/index.astro:238-298`):
- `renderCard(order)` ahora retorna `HTMLElement` construido con `document.createElement`. Todos los valores controlados por el usuario (`notes`, `productName`, `orderNumber`, `displayTime`) van por `textContent` o `createTextNode` — `innerHTML` ya no existe en el path de render.
- `loadOrders()` cambió `colCreated.innerHTML = …` por `colCreated.replaceChildren(...)` con array de nodos.
- Empty state extraído a `renderEmptyState()` también construido por DOM API.
- Helper `el(tag, style)` para reducir verbosity sin volver al patrón frágil de strings.

Receipt cleanup (recibo dashboard era dead code):
- Backend: borrados endpoints `GET/POST /v1/print/receipt/:id`, métodos `generateReceipt`/`generateBoth`/`printReceipt`, `Receipt` interface, `EmailService.sendReceiptEmail`/`buildReceiptHtml`. Llamadas internas `printReceipt` en `OrdersService.createOrder` (gated por `PRINT_CUSTOMER_ON_CREATE`) y `markAsPaid` eliminadas. Env var `PRINT_CUSTOMER_ON_CREATE` eliminada. Kitchen-ticket (otro endpoint del mismo módulo) conservado intacto.
- Frontend: borrado `handleReceipt`, prop `onReceipt` purgada en `OrderCard.tsx`, `OrdersFilteredList.tsx`, `OrdersKanban.tsx`. `CreatedOrderResult` simplificado a `{ order }` sin los nulls residuales.

C — Defensa en profundidad backend (`apps/api-core/src/orders/dto/create-order.dto.ts`):
- `@MaxLength(500)` en `notes` (nivel item).
- `@MaxLength(200)` en `customerName`, `@MaxLength(30)` en `customerPhone`, `@MaxLength(254)` en `customerEmail`, `@MaxLength(500)` en `deliveryAddress` y `deliveryReferences`, `@MaxLength(20)` en `tableNumber`.
- Tests: 13 nuevos casos en `create-order.dto.spec.ts` cubriendo aceptación en el límite exacto y rechazo justo encima (`maxLength` constraint). 2 regression tests adicionales en `kioskCreateOrder.e2e-spec.ts` (no corren por el bug pre-existente de stack overflow del e2e kiosk).

Naming rule: el frontend que renderiza datos controlados por usuarios anónimos (kiosk → cocina, kiosk → dashboard) **debe** usar DOM API + `textContent`. Nunca `innerHTML` + template strings con valores externos. Esto incluye el helper `escapeHtml` — está prohibido porque invita a olvidos.

**Verificación:** 39 suites / 419 tests del backend en verde (13 nuevos en DTO spec). Smoke test visual de cocina con notes maliciosas pendiente — ver caveat al final.

**Caveat conocido:** los e2e del módulo `kiosk` siguen rotos por el stack overflow preexistente al inicializar NestJS con SQLite (documentado en H-01). Los 2 e2e regression que agregué quedan listos para correr cuando se desbloquee esa infra.

---

### H-04 — Tokens JWT en query string (SSE dashboard y cocina)

**Categoría:** seguridad
**Archivos:**
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx:89` — `EventSource(...?token=...)`
- `apps/ui/src/pages/kitchen/index.astro:127, 199` — todo `kitchenFetch` envía token como query

**Descripción:** Tokens en URL quedan en logs de nginx/proxy, en historial del navegador, en `Referer` y son visibles a extensiones. El token de cocina además se persiste en `sessionStorage` indefinidamente.

**Evidencia:**
```ts
new EventSource(`${config.apiUrl}/v1/events/dashboard?token=${token}`);
fetch(`${API_URL}${path}${sep}token=${token}`, ...);
```

**Fix:** Cookie httpOnly + sameSite, **o** endpoint `/auth/sse-ticket` que emita un token efímero (60s) específico para SSE. Para cocina, aceptar token por header `X-Kitchen-Token`.

**Estado:** ⏳ Deferred (2026-05-27)
**Razón:** scope acotado a "esta semana"; requiere diseño separado del mecanismo sse-ticket y refactor del cliente SSE (dashboard + cocina). Tracker como follow-up.

---

## 🟠 ALTOS

### H-05 — `markAsPaid` no es transaccional

**Categoría:** lógica · race condition
**Archivo:** `apps/api-core/src/orders/orders.service.ts:198-226`

**Descripción:** Tres operaciones separadas (`findById` + `updateStatus` + `markAsPaid`) sin `$transaction`. Si `unmarkAsPaid` corre entre la lectura y `markAsPaid`, queda `CONFIRMED + isPaid=false`. Dos requests concurrentes pueden disparar dos transiciones.

**Fix:** Envolver en `$transaction`, usar `update({ where: { id, status: expectedStatus } })` para optimistic locking.

**Estado:** ✅ Implementado (2026-05-27)
**Plan asociado:** `docs/superpowers/plans/2026-05-27-orders-cashshift-kitchen-token-hardening-plan.md`

---

### H-06 — `unmarkAsPaid` sin validación de estado

**Categoría:** lógica
**Archivo:** `apps/api-core/src/orders/orders.service.ts:238-243`

**Descripción:** No valida `order.status !== COMPLETED && order.isPaid === true`. Puede desmarcar una orden ya COMPLETED → estado contradictorio. Además, `findById` se llama pero no se asigna a variable (desperdicio + pierde la oportunidad de validar).

**Fix:** `const order = await this.findById(...)` + validar transición permitida.

**Estado:** ✅ Implementado (2026-05-27)
**Plan asociado:** `docs/superpowers/plans/2026-05-27-orders-cashshift-kitchen-token-hardening-plan.md`

---

### H-07 — `findHistory` sin DTO validado + sin tope de rango fechas

**Categoría:** seguridad · error
**Archivo:** `apps/api-core/src/orders/orders.controller.ts:86-103`

**Descripción:** Acepta query params como strings sueltos sin `class-validator`. `parseInt('abc') = NaN` llega al repo y rompe Prisma con 500 opaco. `dateFrom`/`dateTo` sin tope superior → vector DoS por count + findMany histórico. Sin validación `dateFrom <= dateTo`.

**Fix:** Crear `FindHistoryDto` con `@IsInt`, `@IsEnum(OrderStatus)`, `@IsDateString()`, `@IsInt() @Min(1) @Max(100) limit`, `@MaxDateRange(90)` custom validator.

**Estado:** ✅ Implementado (2026-05-28)
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`

---

### H-08 — `OrderShiftReportRepository` no filtra por `restaurantId`

**Categoría:** seguridad (defensa en profundidad)
**Archivo:** `apps/api-core/src/orders/order-shift-report.repository.ts:34-50`

**Descripción:** `groupOrdersByShift` y `getTopProductsWithNamesByShift` filtran solo por `cashShiftId`. Si un futuro endpoint pasa `sessionId` recibido del cliente sin validar pertenencia, fuga reportes entre tenants.

**Fix:** Aceptar `restaurantId` y agregar `cashShift: { restaurantId }` al `where`.

**Estado:** ✅ Implementado (2026-05-28)
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`

---

### H-09 — Race en `closeSession` (count + update no protegidos)

**Categoría:** lógica · race condition
**Archivo:** `apps/api-core/src/cash-register/cash-register.service.ts:40-78`

**Descripción:** Entre `count(pending orders)` y `update(status=CLOSED)`, el kiosk u otro flujo puede insertar nuevas órdenes en ese turno (postgres default READ COMMITTED). Esas órdenes quedan huérfanas en un turno cerrado.

**Fix:** `SELECT ... FOR UPDATE` sobre `cashShift` al inicio de la TX, o nivel `SERIALIZABLE`. Adicional: `orders.service.createOrder` debe validar dentro de su TX que `cashShift.status === OPEN`.

**Estado:** ✅ Implementado (2026-05-27)
**Plan asociado:** `docs/superpowers/plans/2026-05-27-orders-cashshift-kitchen-token-hardening-plan.md`

---

### H-10 — `closeSession` con `closedBy` opcional

**Categoría:** lógica · auditoría
**Archivo:** `apps/api-core/src/cash-register/cash-register.service.ts:40`

**Descripción:** Firma `closedBy?: string`. Controller siempre pasa `user.id`, pero el tipo opcional permite que un caller interno (CLI, job futuro) cierre sin trazabilidad.

**Fix:** Marcar `closedBy: string` requerido. Opcional: validar que pertenece al mismo restaurante.

**Estado:** ✅ Implementado (2026-05-28) — firma cambiada a `closedBy: string` requerido en `cash-register.service.ts:40`; JSDoc anota que callers no-HTTP deben pasar un identificador único de proceso.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`

---

### H-11 — `CashShiftRepository.close()` declara `totalSales: number`

**Categoría:** dinero
**Archivo:** `apps/api-core/src/cash-shift/cash-shift.repository.ts:47-61`

**Descripción:** El método no está en uso (el cierre real ocurre vía `tx.cashShift.update` en service), pero está exportado. Viola convención BigInt y es bomba latente.

**Fix:** Cambiar a `totalSales: bigint`, o eliminar el método.

**Estado:** ✅ Implementado (2026-05-28) — método eliminado (0 callers en src + test).
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`

---

### H-12 — `getSessionStats`/`getStats` no filtran por `restaurantId`

**Categoría:** seguridad (defensa en profundidad)
**Archivos:**
- `apps/api-core/src/cash-register/cash-register.service.ts:121-127`
- `apps/api-core/src/cash-register/cash-register-stats.service.ts:44`

**Descripción:** Hoy salvado por `CashShiftGuard` en el controller. Si alguien añade un endpoint nuevo que llame estos métodos sin el guard, expone datos cross-tenant.

**Fix:** Aceptar `restaurantId` en ambos métodos y filtrar en la query base.

**Estado:** ✅ Implementado (2026-05-28) — `CashRegisterStatsService.getSummary(restaurantId, sessionId)` y `CashRegisterService.getSessionSummary(restaurantId, sessionId)` con validación de pertenencia; 404 cross-tenant.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`

---

### H-13 — Race en `kitchenAdvanceStatus` (find + update no atómicos)

**Categoría:** lógica · race condition
**Archivo:** `apps/api-core/src/orders/orders.service.ts:180-196` (consumido por `kitchen.service.ts:32-36`)

**Descripción:** `findById` + `updateStatus` separados. Dos cocineros pulsando "Listo" simultáneamente (caso real en KDS multi-pantalla) pasan ambos la validación → doble avance + doble SSE. Si el cajero cancela entre lectura y escritura, se sobrescribe `CANCELLED` con `PROCESSING`.

**Fix:** `update({ where: { id, restaurantId, status: expectedCurrent }, data: { status: newStatus } })`; si `count = 0` → `InvalidStatusTransition`. Alternativa: `$transaction` con SELECT FOR UPDATE.

**Estado:** ✅ Implementado (2026-05-27)
**Plan asociado:** `docs/superpowers/plans/2026-05-27-orders-cashshift-kitchen-token-hardening-plan.md`

**Nota — gap descubierto durante implementación:** `OrderRepository.cancelOrder` aún no usa optimistic concurrency (sigue siendo `update` sin guard por status). Un cancel concurrente puede sobreescribir un advance/markAsPaid recién commitado, dejando estados como `status=CANCELLED, isPaid=true`. Trackear como backlog: extender `transitionStatusIfMatches` pattern a `cancelOrder`.

---

### H-14 — `KitchenTokenGuard` débil

**Categoría:** seguridad
**Archivo:** `apps/api-core/src/kitchen/guards/kitchen-token.guard.ts:23-26`

**Descripción:** Token plano en BD (`settings.kitchenToken`), expira en 60 días, viaja en query, comparado con `!==` (timing attack). Filtración de logs/BD compromete cocinas indefinidamente.

**Fix:** Guardar `sha256(token)`, comparar con `crypto.timingSafeEqual`, aceptar header `X-Kitchen-Token` además de query.

**Estado:** ✅ Implementado (2026-05-27)
**Plan asociado:** `docs/superpowers/plans/2026-05-27-orders-cashshift-kitchen-token-hardening-plan.md`

---

### H-15 — `notifyOffline` emite en canal equivocado

**Categoría:** lógica · SSE
**Archivo:** `apps/api-core/src/kitchen/kitchen.service.ts:82-84`

**Descripción:** Debería notificar al dashboard según `info.md`, pero publica en `restaurant$` que es escuchado por kiosk, cocina y todos los clientes del restaurante.

**Fix:** Crear canal/evento específico para dashboard o filtrar por tipo de cliente (`dashboard`, `kiosk`, `kitchen`).

**Estado:** ✅ Implementado (2026-05-28) — feature eliminado completo (endpoint + service method + spec + llamada UI). Diagnóstico revisado: el evento iba al canal correcto (restaurant SSE stream con `event: 'kitchen:offline'`) pero ningún cliente UI tenía listener registrado. Se borra todo en lugar de cablear un listener nuevo (YAGNI).
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`

---

### H-16 — `UpdateKitchenStatusDto` permite `SERVED` como primer estado

**Categoría:** lógica
**Archivos:**
- `apps/api-core/src/kitchen/dto/update-kitchen-status.dto.ts:5-11`
- `apps/api-core/src/orders/orders.service.ts:188`

**Descripción:** El DTO acepta `PROCESSING|SERVED` indistintamente. La validación `targetIdx === currentIdx + 1` protege hoy, pero el chequeo `targetIdx > KITCHEN_MAX_IDX` es código muerto (`SERVED === KITCHEN_MAX_IDX`). Un futuro estado entre PROCESSING/SERVED rompería la protección sin que fallen tests.

**Fix:** Revisar el chequeo dual o consolidar a una sola fuente de verdad (state machine explícita).

**Estado:** ✅ Implementado (2026-05-28) — nueva clase `OrderStateMachine` en `apps/api-core/src/orders/order-state-machine.ts` centraliza transiciones; `assertCanAdvance(from, to, actor)` consolida el chequeo dual frágil; `UpdateKitchenStatusDto` y `orders.service.ts` consumen `KITCHEN_ALLOWED_TARGETS` como única fuente de verdad. Spec dedicado `order-state-machine.spec.ts` cubre matriz exhaustiva.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`

---

### H-17 — EventSource se reabre en cada cambio de filtro

**Categoría:** error (frontend)
**Archivo:** `apps/ui/src/components/dash/orders/OrdersPanel.tsx:85-96`

**Descripción:** `activeFilter` en deps del `useEffect` que crea el EventSource → cada filtrado cierra/reabre conexión SSE (handshake completo, posible pérdida de eventos).

**Fix:** Mover `activeFilter` a un `useRef` y leerlo dentro del callback.

**Estado:** ✅ Implementado (2026-05-28) — `activeFilter` movido a `useRef`; el `useEffect` del SSE ya no lo tiene en deps. Conexión queda abierta a través de cambios de filtro. Test regression en `OrdersPanel.test.tsx`.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`

---

### H-18 — Doble submit posible en OrderCard

**Categoría:** lógica (frontend)
**Archivos:**
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx:98-161`
- `apps/ui/src/components/dash/orders/OrderCard.tsx:113-185`

**Descripción:** Ningún botón (Confirmar, Procesar, Entregar, Pagar) se deshabilita mientras la mutación está en vuelo. Click rápido emite dos PATCH.

**Fix:** Mantener `Set<string>` de IDs en vuelo y deshabilitar botones del card correspondiente.

**Estado:** ✅ Implementado (2026-05-28) — `OrdersPanel` rastrea ids en vuelo en un `Set<string>`; `withInFlight(id, fn)` envuelve cada handler; `OrderCard` recibe `inFlightIds`, computa `isBusy = inFlightIds.has(order.id)` y deshabilita todos los botones de acción (`disabled={isBusy}` + `aria-busy`); `OrdersKanban` y `OrdersFilteredList` forwardean el set. Test regression cubre doble click y disable-during-mutation en ambas vistas.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`

---

### H-19 — `handleReceipt` falla silenciosamente si popup bloqueado

**Categoría:** error (frontend)
**Archivo:** ~~`apps/ui/src/components/dash/orders/OrdersPanel.tsx:174-193`~~ (eliminado)

**Estado:** ❌ Descartado (2026-05-28)
**Decisión:** El módulo de recibo del dashboard se borró completamente durante H-03 (cleanup del XSS + dead code). `handleReceipt`, `onReceipt` y el endpoint `POST /v1/print/receipt/:id` ya no existen. El bug que H-19 describía está físicamente removido — no hay código que arreglar.
**Verificación:** `grep -rn "handleReceipt\|onReceipt" apps/ui/src/components/dash/orders/` retorna 0 resultados (2026-05-28).

---

### H-20 — `kitchenAdvanceStatus` confía en el caller para `restaurantId`

**Categoría:** seguridad
**Archivo:** `apps/api-core/src/orders/orders.service.ts:180-196`

**Descripción:** El método protege multi-tenant vía `findById(id, restaurantId)` — OK siempre que `restaurantId` venga del JWT (no del body). Hay que confirmar que `KitchenController` lo deriva de `@CurrentUser()` y no acepta del body.

**Fix:** Auditar `kitchen.controller.ts` y agregar comentario explícito en el service: "restaurantId DEBE venir del JWT".

**Estado:** ✅ Implementado (2026-05-28) — auditoría confirma que `kitchen.controller.ts` deriva `restaurantId` de `KITCHEN_RESTAURANT_KEY` (guard), no del body. JSDoc en `kitchenAdvanceStatus` + comentario inline en el controller documentan explícitamente la invariante.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-altos-plan.md`

---

## 🟡 MEDIOS

### H-21 — `paymentMethod` llega al repo como `string` sin re-validar
**Archivos:** `apps/api-core/src/orders/dto/create-order.dto.ts:47-50`, `order.repository.ts:75`
**Descripción:** DTO valida con `@IsEnum`, pero el repo hace `as PaymentMethod`. Llamada interna que no use el DTO acepta string arbitrario.

**Estado:** ✅ Implementado (2026-05-29) — `CreateOrderData.paymentMethod` tipado como `PaymentMethod | undefined`; eliminado `as PaymentMethod` en `createWithItems`. Compile-time test `order.repository.spec.ts` verifica que strings arbitrarios no son asignables.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-22 — `serializeOrder` con `Record<string, any>` + `as T`
**Archivo:** `apps/api-core/src/orders/order.repository.ts:12-36`
**Descripción:** Oculta errores de tipo. Debería ser un Serializer dedicado con `@Transform(fromCents)`.

**Estado:** ✅ Parcial (2026-05-25) — la causa crítica está arreglada; el refactor estructural sigue pendiente.

**Diagnóstico:** durante el smoke test del fix de H-01 apareció un bug visible: el kiosk mostraba `Total: $5000.00` para una orden real de $50 (2 unidades × $25). Causa raíz: `serializeOrder` aplicaba `Number(BigInt)` sin `fromCents`, así que `totalAmount`, `unitPrice`, `subtotal` y `product.price` salían en centavos crudos. El mismo bug afectaba al dashboard (`OrderCard.tsx:77`, `OrdersPanel.tsx:184, 186`) — todos esos puntos también mostraban totales 100× inflados; no se había notado porque las cifras en CLP/ARS parecen razonables.

**Cambios aplicados (fix crítico):**
- `apps/api-core/src/orders/order.repository.ts:13-44` — `serializeOrder` ahora aplica `fromCents()` a `totalAmount`, `items[].unitPrice`, `items[].subtotal`, `items[].product.price`, `items[].menuItem.priceOverride`.
- `apps/ui/src/components/kiosk/OrderConfirmation.tsx` — rediseñado el detalle del item para mostrar precio unitario explícito (`2 × $25.00`) además del subtotal, así el cliente sabe cuánto cuesta cada producto.
- `apps/api-core/src/orders/orders.module.info.md` — documentado que la respuesta expone montos en pesos.

**Verificación:** 420 unit tests del backend en verde. 7 archivos de e2e de orders también en verde, incluido `createOrderFromDashboard`. Smoke test del kiosk confirma `Total: $50.00` para orden de 2× $25.

**Lo que sigue pendiente:** ~~el refactor estructural~~ — completado el 2026-05-29.

**Estado:** ✅ Implementado completo (2026-05-29). La parte crítica (`fromCents` en `serializeOrder`) ya estaba en 2026-05-25; el refactor estructural a `OrderSerializer` + `OrderItemSerializer` (con `@Exclude/@Expose` y eager `fromCents` en constructor) se completó en este batch. Función `serializeOrder<T>` eliminada del repo.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-23 — `groupBy` Prisma con `as unknown as` (doble coerción)
**Archivo:** `apps/api-core/src/orders/order-shift-report.repository.ts:40, 50`

**Estado:** ✅ Implementado (2026-05-29) — `groupOrdersByShift` ahora hace `as OrderGroupRow[]` directo. `getTopProductsWithNamesByShift` conserva `as unknown as TopProductRow[]` con comentario explicativo (Prisma `orderItem.groupBy` infiere un tipo intersección incompatible con el row deseado; un refactor completo via `Prisma.GetOrderItemGroupByPayload<...>` queda como deuda menor).
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-24 — `listOrders` lanza 409 si no hay caja abierta (bloquea visibilidad)
**Archivo:** `apps/api-core/src/orders/orders.service.ts:107-116`
**Descripción:** Una orden huérfana entre turnos no es visible. Decisión de diseño — confirmar con producto.

**Estado:** 🔄 Decisión consciente (2026-05-29). Se **mantiene** `409 NO_OPEN_CASH_REGISTER`. Justificación documentada en `apps/api-core/src/orders/orders.module.info.md`: el dashboard solo muestra órdenes del turno actual; sin caja abierta no hay noción de "actuales". Órdenes huérfanas son visibles vía `/orders/history`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-25 — `CashShiftSerializer` mantiene `bigint` sin `@Transform(fromCents)` defensivo
**Archivo:** `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts:13-22`
**Descripción:** Confía solo en `@Exclude()` de clase. Si alguien añade `@Expose()` por error, sale BigInt serializado mal.

**Estado:** ✅ Implementado (2026-05-29) — `@Transform(({ value }) => typeof value === 'bigint' ? fromCents(value) : value)` agregado defensivamente a `openingBalance` y `totalSales`. Si alguien añade `@Expose()` por error, el valor sale en pesos en vez de filtrar BigInt crudo (que rompería `JSON.stringify`).
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-26 — `_count.orders` siempre expuesto, presente solo en algunos endpoints
**Archivo:** `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts:44-45`
**Descripción:** Cliente recibe `_count: undefined`. Romper en dos serializers o filtrar condicional.

**Estado:** ✅ Implementado (2026-05-29) — split en dos serializers: `CashShiftSerializer` (base, sin `_count`) y `CashShiftWithCountSerializer` (hereda y expone `_count.orders`). Controller usa el variante con count en `/history` y `/current`; el variant base sigue disponible para futuros endpoints que no necesiten el conteo.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-27 — `getCurrentSession` devuelve `{}` y usa `as any`
**Archivo:** `apps/api-core/src/cash-register/cash-register.controller.ts:129-136`
**Descripción:** Rompe contrato Swagger. Devolver `null`.

**Estado:** ✅ Implementado (2026-05-29) — service retorna `CashShiftWithUserAndCount | null` directo; controller responde `null` (status 200 con body vacío) cuando no hay sesión, y `CashShiftWithCountSerializer` cuando sí. UI callers en `dash/register/api.ts` y `dash/orders/api.ts` actualizados para tolerar el body vacío.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-28 — `topProducts` ejecuta el stats completo solo para el top-N
**Archivo:** `apps/api-core/src/cash-register/cash-register.controller.ts:160-174`
**Descripción:** Desperdicia 90% del cálculo. Llamar `getTopProductsWithNamesByShift` directamente.

**Estado:** ✅ Implementado (2026-05-29) — controller inyecta `OrderShiftReportRepository` (vía `OrdersModule` ya importado) y llama directo a `getTopProductsWithNamesByShift`. Misma shape de respuesta (vía `StatsTopProductSerializer`).
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-29 — `displayOpenedAt` no maneja `timeZone` inválida ni `openedAt` undefined
**Archivo:** `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts:52-67`
**Descripción:** `Intl.DateTimeFormat` lanza `RangeError` con TZ corrupta → 500 opaco.

**Estado:** ✅ Implementado (2026-05-29) — extraído a `safeFormatter(timezone)` con `try/catch` que cae a UTC si la TZ es inválida. Patrón replicado en `formatKitchenTime` para `KitchenOrderSerializer`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-30 — `averageTicket` con división entera BigInt (puede no satisfacer `avg * count == total`)
**Archivo:** `apps/api-core/src/cash-register/cash-register-stats.service.ts:103-105`
**Descripción:** Documentar comportamiento o redondear consistentemente.

**Estado:** ✅ Implementado (2026-05-29) — JSDoc agregado a `calculateRevenue` explicando que `averageTicket` es BigInt floor division en centavos, con cota de error ≤ `(N-1)/100` pesos por turno. La discrepancia siempre cae dentro del último decimal redondeado por la UI.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-31 — Stats sin caché para turnos CLOSED
**Archivo:** `apps/api-core/src/cash-register/cash-register.service.ts:84-109`
**Descripción:** Stats de turnos cerrados son inmutables → cacheables.

**Estado:** ✅ Implementado (2026-05-29) — `CashRegisterService` mantiene `Map<sessionId, ShiftSummary>` con cap 200 FIFO. Solo cachea turnos CLOSED (data inmutable por garantía de H-09). Documentado en `cash-register.module.info.md`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-32 — Cola de cocina ignora `cashShift.status=OPEN`
**Archivo:** `apps/api-core/src/orders/order.repository.ts:113-120`
**Descripción:** Órdenes huérfanas de turnos cerrados reaparecen al día siguiente.

**Estado:** ✅ Implementado (2026-05-29) — `findActiveOrders` ahora filtra `cashShift: { status: CashShiftStatus.OPEN }`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-33 — Cola de cocina ordena `createdAt desc` (contraintuitivo para FIFO)
**Archivo:** `apps/api-core/src/orders/order.repository.ts:117`
**Descripción:** Cocina normalmente es FIFO. Cambiar a `asc` + tiebreaker `orderNumber asc`, o documentar la razón del `desc`.

**Estado:** ✅ Implementado (2026-05-29) — `orderBy: [{ createdAt: 'asc' }, { orderNumber: 'asc' }]`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-34 — Mass-assignment vía `Object.assign(this, partial)` en serializers
**Archivos:** `apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts:43-54`, `kitchen-order-item.serializer.ts:53-58`
**Descripción:** Copia `restaurantId`, `cashShiftId`, `isPaid`, etc. Filtrado depende del interceptor; `JSON.stringify` directo expone todo.

**Estado:** ✅ Implementado (2026-05-29) — `Object.assign(this, partial)` reemplazado por asignación explícita campo a campo en `KitchenOrderSerializer`, `KitchenOrderItemSerializer` y `KitchenProductSerializer`. Test verifica que `restaurantId`/`cashShiftId`/`isPaid`/`customerEmail` no salen ni en el instance ni en `instanceToPlain`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-35 — Validación de cancelación solo en cliente, sin `maxLength`
**Archivo:** `apps/ui/src/components/dash/orders/CancelOrderModal.tsx:14-22`
**Descripción:** Cajero puede enviar 100KB de motivo. Backend debe validar; cliente debe limitar UX.

**Estado:** ✅ Implementado (2026-05-29) — Backend: `@MaxLength(500)` en `CancelOrderDto.reason`. Frontend: `maxLength={500}` en el input + contador `0/500`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-36 — Wizard puede confirmar `items: []`
**Archivo:** `apps/ui/src/components/dash/orders/CreateOrderModal.tsx:98`
**Descripción:** Step3 no revalida que haya items en el carrito.

**Estado:** ✅ Implementado (2026-05-29) — Guard `items.length === 0` al inicio de `handleConfirm` con mensaje de error.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-37 — `parseInt(e.target.value)` sin radix; cantidad NaN se vuelve 0
**Archivos:** `CreateOrderStep1.tsx:98`, `OrderFilterPanel.tsx:35`
**Descripción:** Borrar el input elimina el item silenciosamente.

**Estado:** ✅ Implementado (2026-05-29) — `parseInt(e.target.value, 10)` en `CreateOrderStep1.tsx`. `OrderFilterPanel.tsx:35` ya usaba radix 10.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-38 — `toFixed(2)` en lugar de `Intl.NumberFormat`
**Archivos:** `OrderCard.tsx:77`, `OrdersPanel.tsx:184, 186`
**Descripción:** CLP/COP no usan decimales; muestra "$300.00" mal.

**Estado:** ✅ Implementado (2026-05-29) — `OrderCard.tsx` ahora usa `formatMoney(Number(order.totalAmount), settings)` con `useRestaurantSettings()`. Side effect: agrega dependencia de `QueryClientProvider`; tests aislados `OrdersFilteredList.test.tsx` y `OrdersPanel.test.tsx` mockean `restaurant-settings`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

### H-39 — `prerender = true` en `dash/orders.astro`
**Archivo:** `apps/ui/src/pages/dash/orders.astro:2`
**Descripción:** Hoy no expone datos porque toda la UI es client-side, pero contradice un dashboard autenticado. Riesgo futuro si se añade SSR de datos.

**Estado:** 🔄 Diferido (2026-05-29). `apps/ui` corre con Astro `output: 'static'` sin adapter, así que `prerender = false` per-page rompe el build (`NoAdapterInstalled`). Requiere migración a `output: 'hybrid'` o `'server'` con adapter (`@astrojs/node` u otro) — decisión arquitectónica fuera del scope del batch MEDIOS. Mitigación temporal: la auth se enforza client-side por `apiFetch` (redirige a `/login` en 401); el bundle estático no expone datos sensibles, solo estructura HTML.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`

---

## 🟢 BAJOS

### H-40 — Imports sin uso en `orders.service.ts`
**Archivo:** `apps/api-core/src/orders/orders.service.ts:19`
**Descripción:** `EmailService`, `ForbiddenAccessException` importados/inyectados sin uso.

### H-41 — `cancelOrder` permite cancelar desde `SERVED`
**Archivo:** `apps/api-core/src/orders/orders.service.ts:166-178`
**Descripción:** Confirmar con producto si tiene sentido.

### H-42 — No se restaura stock al cancelar
**Archivo:** `apps/api-core/src/orders/orders.service.ts:166-178`
**Descripción:** Decisión consciente o bug — documentar.

### H-43 — Códigos de error inconsistentes (`REGISTER_*` vs `CASH_REGISTER_*`)
**Archivos:** `cash-register.exceptions.ts:9`, `cash-register.controller.ts:59,143,165`

### H-44 — `CashRegisterModule` importa `OrdersModule` completo solo para un repo
**Archivo:** `apps/api-core/src/cash-register/cash-register.module.ts:8,12`

### H-45 — Constraint "un turno abierto por restaurante" no versionado en Prisma
**Archivo:** `apps/api-core/prisma/schema.postgresql.prisma:243-244` (comentario)
**Descripción:** Índice parcial manual. Si falta en un ambiente nuevo, `openSession` permite duplicados.

### H-46 — `notifyOffline` declarado `async` sin await
**Archivo:** `apps/api-core/src/kitchen/kitchen.service.ts:82-84`

### H-47 — `restaurant!.slug` con non-null assertion frágil
**Archivo:** `apps/api-core/src/kitchen/kitchen.service.ts:47-48`

### H-48 — `generateToken` valida `expiresAt` después de generar
**Archivo:** `apps/api-core/src/kitchen/kitchen.service.ts:57-73`

### H-49 — `apiFetch` sin dedup en refresh token concurrente
**Archivo:** `apps/ui/src/lib/api.ts:41`
**Descripción:** Dos requests con 401 al mismo tiempo disparan dos `/auth/refresh` en cascada.

### H-50 — `OrderFilterPanel.tsx:35` acepta `orderNumber` negativo (pegado)
**Descripción:** `min={1}` no protege contra paste.

### H-51 — `aria-label` faltante en botón cerrar de `OrderFilterPanel`
**Archivo:** `OrderFilterPanel.tsx:58`

### H-52 — `displayTime?` opcional pero JSX no contempla `undefined`
**Archivo:** `apps/ui/src/components/dash/orders/OrderCard.tsx:61`

---

## Lo que está bien (verificado)

- Ningún `$queryRaw` sin parametrizar en los módulos auditados.
- Ningún endpoint público (`@Public()`) que filtre datos financieros.
- Aislamiento multi-tenant del `kitchenAdvanceStatus` (toma `restaurantId` del guard, no del body).
- Serializers del módulo kitchen usan `fromCents` correctamente.
- `apiFetch` con auto-refresh JWT y redirect a `/login` correctamente implementado.
- Los `@Public()` están bien delimitados al kiosk.
- `CreateOrderDto` no expone `restaurantId` (se toma del JWT en el controller).

---

## Orden sugerido de remediación

| Sprint | Hallazgos |
|--------|-----------|
| **Hoy / hotfix** | ~~H-01 (kiosk roto)~~ ✅, ~~H-02 (precios wizard)~~ ✅, ~~H-03 (XSS)~~ ✅, H-04 (tokens en URL) ⏳ deferred, ~~H-AUX-01 (contrato cash-register)~~ ✅ |
| **Esta semana** | ~~H-05 (markAsPaid TX)~~ ✅, ~~H-06 (unmarkAsPaid)~~ ✅, ~~H-09 (closeSession race)~~ ✅, ~~H-13 (kitchen race)~~ ✅, ~~H-14 (kitchen token)~~ ✅ |
| **Próximo sprint** | ~~H-07 (findHistory DTO)~~ ✅, ~~H-11 (BigInt cash-shift)~~ ✅, ~~H-08/H-12 (filtros restaurantId)~~ ✅, ~~H-15 (notifyOffline canal)~~ ✅ |
| **Backlog técnico** | ~~H-17, H-18, H-20~~ ✅, ~~todos los MEDIOS~~ ✅ (2026-05-29, H-24 🔄 + H-39 🔄), H-AUX-02 |
| **Limpieza** | Todos los BAJOS |
| **Deuda colateral descubierta** | E2e del módulo `kiosk` con SQLite (stack overflow al inicializar NestJS). Preexistente, no relacionado con H-01. |

---

## Notas para la revisión punto por punto

- Cada hallazgo tiene ID estable. Al discutir, referirse como "H-01", "H-13", etc.
- Para cada hallazgo aceptado, agregar al final del bloque:
  ```
  **Estado:** ✅ Aceptado / ❌ Descartado / 🔄 Modificado
  **Decisión:** <razón>
  **Plan asociado:** <ruta al plan si se crea uno>
  ```
- Los hallazgos descartados deben mantenerse en el spec con justificación (no eliminarlos) para futura referencia.
