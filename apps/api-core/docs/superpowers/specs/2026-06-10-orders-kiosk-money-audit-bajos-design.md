# Diseño — Resolución de hallazgos 🟢 BAJO (Auditoría R2: orders/kiosk/caja)

**Fecha:** 2026-06-10
**Spec madre:** `2026-06-07-orders-kiosk-money-audit-findings.md`
**Alcance:** los 7 hallazgos de severidad 🟢 BAJO pendientes (R2-06 … R2-12). Los ALTO/MEDIO (R2-01 … R2-05) ya están resueltos.
**Tipo:** diseño (decisiones tomadas) — la implementación se planifica aparte con writing-plans.
**Apps tocadas:** `apps/api-core` (orders, kiosk, schema/doc) y `apps/ui` (settings, kiosk store, cancel modal).

---

## Contexto y modelo mental de dinero (aclarado con el usuario)

Aclaración clave que enmarca varios hallazgos:

- El sistema **no modela "monedas" con reglas propias** (no respeta ISO 4217 minor units). Internamente **siempre** opera en centavos (`×100`), es decir **siempre 2 decimales de precisión**, sin importar la moneda.
- El `currency` de `RestaurantSettings` es **solo una etiqueta de display** (símbolo). Los `decimalSeparator`/`thousandsSeparator` son configuración de **presentación**.
- El frontend formatea los montos con esos settings; el valor numérico siempre tiene 2 decimales internos.
- Si un restaurante no quiere ver los 2 decimales (p.ej. CLP), eso se resuelve **en el frontend** (capa de display) — fuera del alcance de este spec.

Consecuencia: la dupla R2-06/R2-07 deja todo el flujo de dinero homogéneo en **centavos enteros** (`bigint`), y R2-10 alinea la documentación con este modelo currency-agnostic.

---

## Resumen de decisiones

| ID | Decisión | App |
|----|----------|-----|
| R2-06 | Aritmética en `bigint` end-to-end en la creación de órdenes | api-core |
| R2-07 | El kiosk calcula `expectedTotal` en centavos enteros | ui |
| R2-08 | Quitar referencias muertas a overrides de `MenuItem` + corregir doc | api-core |
| R2-09 | Rotular el selector de formato por el separador decimal real | ui |
| R2-10 | Solo doc: moneda = etiqueta de display, siempre 2 decimales | api-core |
| R2-11 | Restaurar stock al cancelar solo en `CREATED`/`CONFIRMED` + doc + cartel | api-core + ui |
| R2-12 | Filtrar el endpoint público de estado por `restaurantId` del slug | api-core |

**Orden de implementación sugerido:** R2-06 + R2-07 juntos (acoplados por el modelo de centavos enteros). El resto es independiente y puede ir en cualquier orden.

---

## R2-06 — Aritmética de dinero en `bigint` end-to-end (backend)

### Problema
`validateAndBuildItems` (`apps/api-core/src/orders/orders.service.ts:357-388`) convierte `product.price` (que ya es `BigInt`) a `Number` y calcula `subtotal`/`totalAmount` en punto flotante, violando la regla de oro de `common/helpers/money.ts:8-9` ("NEVER use floating-point arithmetic for money"). Además `validateExpectedTotal` hace `BigInt(totalAmount)` (`:403`), que lanzaría `RangeError` si el monto dejara de ser entero. Hoy es numéricamente seguro (centavos enteros × cantidad entera), pero es una bomba latente y un mal precedente.

### Decisión
Operar en `bigint` sin salir nunca a `Number`:

```ts
const unitPrice = product.price;                          // bigint, ya en centavos (sin Number())
...
subtotal: unitPrice * BigInt(item.quantity),              // bigint × bigint
...
const totalAmount = orderItems.reduce((s, i) => s + i.subtotal, 0n);  // suma bigint, semilla 0n
```

Y la validación pasa a comparación directa de `bigint`:

```ts
// antes: if (BigInt(totalAmount) !== expectedTotal)
if (expectedTotal !== undefined && totalAmount !== expectedTotal)
```

### Cambios
- `OrderItemEntry.unitPrice` y `.subtotal`: `number` → `bigint`.
- Firma de `validateAndBuildItems`: `totalAmount: number` → `bigint`.
- `validateExpectedTotal(totalAmount: bigint, expectedTotal?: bigint)`.
- `persistOrder`/`createWithItems`: ya escriben a columnas `BigInt`; ajustar el tipo de `totalAmount` que reciben (probablemente simplifica casts existentes).
- `item.quantity` (number entero del DTO) se envuelve en `BigInt(item.quantity)` para multiplicar.

### No cambia
La API (request/response siguen en pesos vía `@Transform`/serializer) ni la DB.

### Tests
- Unit de `validateAndBuildItems`/`validateExpectedTotal` con tipos `bigint`.
- Caso de match/mismatch de `expectedTotal` (ya no debe poder lanzar `RangeError`).

---

## R2-07 — `expectedTotal` del kiosk en centavos enteros (frontend)

### Problema
`apps/ui/src/components/kiosk/store/kiosk.store.ts:310` suma `c.price * c.quantity` en **pesos float** y envía `expectedTotal`. Como el sistema siempre admite 2 decimales, en teoría la acumulación flotante podría cruzar el medio centavo y disparar un falso `400 "los precios de tu pedido han cambiado"`.

> **Medición real:** se verificó empíricamente que ni con 100.000 líneas hay mismatch — el `Math.round(total×100)` final del backend absorbe el error de float (haría falta del orden de decenas de miles de millones de líneas para fallar). El fix es por **higiene y coherencia**, no por un peligro presente.

### Decisión
Sumar en centavos enteros, espejando el backend (R2-06):

```ts
expectedTotal: cart.reduce((s, c) => s + Math.round(c.price * 100) * c.quantity, 0),
```

`Math.round(c.price * 100)` da centavos enteros por ítem (un solo round, sin acumular error); la suma queda en enteros y coincide exacto con el `bigint` del backend.

### Tests
- Unit del cálculo de `expectedTotal` con precios fraccionarios → entero esperado.

---

## R2-08 — Quitar referencias muertas a overrides de `MenuItem` (backend + doc)

### Problema
La feature de overrides de precio/stock por menú **existió y fue removida**, pero quedaron referencias muertas y documentación que la promete:
- `apps/api-core/src/kiosk/kiosk.service.ts:140` (`item.stock ?? item.product.stock`) y `:143` (`item.price ?? item.product.price`) — `item.price`/`item.stock` son siempre `undefined` (el `MenuItem` del schema solo tiene `sectionName` y `order`).
- `CLAUDE.md` afirma *"MenuItem (pivot with optional price/stock overrides)"*.
- `kiosk.module.info.md` lo repite.

### Decisión
Limpiar (la feature no se reintroduce en este spec):
- En `kiosk.service.ts`, usar directo `item.product.price` / `item.product.stock` (quitar los `??`).
- Corregir `CLAUDE.md`: quitar "with optional price/stock overrides".
- Corregir `kiosk.module.info.md`.
- Barrer tipos/serializers por cualquier otra referencia a `price`/`stock` sobre `MenuItem` y eliminarla.

### Tests
- Los tests existentes del kiosk siguen verdes (el comportamiento efectivo no cambia: siempre se usó el del producto).

---

## R2-09 — Etiquetas del selector "Formato decimal" (frontend)

### Problema
En `apps/ui/src/components/dash/RestaurantSettingsForm.tsx:155-162`, el control "Formato decimal" rotula sus opciones con la palabra del **separador de miles** ("Punto"/"Coma"), que contradice el título y puede inducir a elegir mal. No hay bug de datos (el `value` y el ejemplo numérico son correctos).

### Decisión
Rotular por el **separador decimal real**:

```tsx
<input type="radio" value="," ... /> <span>Coma decimal (1.234,56)</span>
<input type="radio" value="." ... /> <span>Punto decimal (1,234.56)</span>
```

### Tests
- Ajustar cualquier test/snapshot del formulario que afirme el texto anterior.

---

## R2-10 — Documentar el modelo currency-agnostic (doc)

### Problema
El schema (`apps/api-core/prisma/schema.postgresql.prisma:105-111`) etiqueta `currency` como `// ISO 4217`, lo que promete respetar las minor units del estándar (p.ej. CLP sin decimales). El sistema deliberadamente **ignora** eso y siempre usa 2 decimales. La contradicción confunde sobre el comportamiento real. No hay daño funcional: una moneda sin decimales solo se ve "rara" (`$1.000,00`), pero entra y sale consistente.

### Decisión
Solo documentación, sin tocar código de cálculo ni render:
- Reescribir el comentario del schema: `currency` es un **código/etiqueta de moneda usado solo para display**; los montos **siempre** usan 2 decimales internos (centavos `×100`), independientes de las minor units ISO 4217. Quitar/matizar el `// ISO 4217` para que no prometa lo que no hace.
- Documentar la suposición "siempre 2 decimales internos; la moneda no altera la precisión" en `apps/api-core/docs/money-conversion.md`.
- (Si se quisiera ocultar decimales por moneda en el futuro, es un feature de frontend con su propio spec — explícitamente fuera de alcance.)

### Tests
- N/A (solo doc).

---

## R2-11 — Restaurar stock al cancelar solo antes de cocinar (backend + doc + UI)

### Problema
El stock se decrementa al **crear** la orden (`orders.service.ts:82`, `decrementAllStock`, solo productos con `stock !== null`); la orden nace en `CREATED`. `cancelOrder` (`:162-202`) **no** restaura stock. Una cancelación temprana (nadie cocinó) reduce inventario de forma permanente → el kiosk puede mostrar "agotado" con producto físico disponible (la razón de no restaurar siempre, H-42, es que una cancelación tardía pudo consumir el insumo).

Estados desde los que se puede cancelar (`OrderStateMachine.assertCanCancel`): `CREATED`, `CONFIRMED`, `PROCESSING`, `SERVED` (no `COMPLETED`, no `CANCELLED`, no `isPaid=true`). Pedidos de kiosk inician en `CREATED`; los de staff en `CONFIRMED` — ambos dentro de la ventana "antes de cocinar".

### Decisión — restaurar solo en `CREATED` / `CONFIRMED`
El corte coincide con `CONFIRMED → PROCESSING` ("la comanda entra a cocina"). Los estados que devuelven stock **no van a cambiar por ahora**.

**Backend** — dentro de la `$transaction` existente de `cancelOrder`, después del guard race-safe:

```ts
const count = await this.orderRepository.cancelOrderIfCancellable(tx, id, restaurantId, order.status, reason);
if (count === 0) { /* manejo de carrera existente */ }

const restorable = order.status === OrderStatus.CREATED || order.status === OrderStatus.CONFIRMED;
if (restorable) {
  await this.restoreStock(tx, id);   // re-incrementa stock de los items
}
```

`restoreStock`:
- Espejo de `decrementAllStock`: re-incrementa `+quantity` **solo** para ítems cuyo producto tenga `stock !== null` hoy.
- `updateMany` por producto, **ordenado por `productId`** (mismo patrón anti-deadlock que `decrementAllStock`).
- **Idempotente** por construcción: la restauración solo corre si `cancelOrderIfCancellable` devolvió `count===1` (ganó la única cancelación posible); cancelaciones concurrentes ven `count===0` y no restauran. Imposible doble restauración.
- La decisión `restorable` usa `order.status` **previo** (el mismo `expectedStatus` del guard), garantizando consistencia con la carrera.

**Edge case aceptado:** un producto que al crear tenía `stock=null` (no descontó) y luego se le activó control de stock se restauraría de más. Es marginal; se acepta (no se agrega columna por-ítem para rastrear si descontó).

**Doc** — `apps/api-core/src/orders/orders.module.info.md`:
- Sección de reglas de negocio: documentar "al cancelar en `CREATED`/`CONFIRMED` se restaura stock; en `PROCESSING`/`SERVED` no".
- Actualizar el flujo/diagrama de cancelación (hoy dice "CREATED o PROCESSING → CANCELLED").

**UI** — `apps/ui/src/components/dash/orders/CancelOrderModal.tsx`:
- Cartel **estático** (un único mensaje fijo, sin pasar `status` ni lógica condicional; la firma del modal no cambia):
  > ℹ️ *Si el pedido aún no entró a cocina (Creado o Confirmado), el stock de los productos se restaurará al inventario. Si ya está En preparación o Servido, el stock no se devuelve.*
- La fuente de verdad es el backend; el cartel es informativo.

### Tests
- Cancel en `CREATED` → stock restaurado; en `CONFIRMED` → restaurado.
- Cancel en `PROCESSING`/`SERVED` → stock NO restaurado.
- Producto con `stock=null` → no se toca.
- Concurrencia cancel‖cancel → no restaura dos veces (e2e real-DB, junto a `raceConditions`/`cancelOrder` e2e existentes).

---

## R2-12 — IDOR del endpoint público de estado de orden (backend)

### Problema
`GET /v1/kiosk/:slug/orders/:orderId` (`apps/api-core/src/kiosk/kiosk.controller.ts:72-96`) resuelve el restaurante por slug pero **descarta** el resultado y busca la orden con `findById(orderId)` solo por id, sin cruzar `restaurantId`. Quien conozca/adivine un `orderId` (UUID v4, no enumerable) puede leer `status`/`totalAmount`/`items` de una orden de otro restaurante. Documentado como "intencional" en `kiosk.module.info.md:202`.

### Decisión
Cerrar el vector filtrando por el restaurante del slug:

```ts
const restaurant = await this.kioskService.resolveRestaurant(slug);   // ya no se descarta
const order = await this.orderRepository.findById(orderId);
if (!order || order.restaurantId !== restaurant.id) {
  throw new EntityNotFoundException('Order', orderId);   // 404, no filtra existencia cruzada
}
```

(Alternativa más limpia a definir en el plan: `findFirst({ where: { id: orderId, restaurantId } })` en el repo, validando antes de traer la orden.)

- Actualizar `kiosk.module.info.md:202` (ya no es comportamiento intencional).

### Tests
- e2e: orden de otro restaurante vía slug ajeno → 404.
- e2e: orden propia del slug → 200 (sin regresión del polling).

---

## Fuera de alcance (explícito)
- Reintroducir la feature de overrides de precio/stock por menú (R2-08 B).
- Ocultar decimales por moneda en el render (R2-10): es un feature de frontend con su propio spec.
- Cualquier cambio a la máquina de estados más allá de la restauración condicional de stock.
