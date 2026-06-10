# R2 BAJO Audit Findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver los 7 hallazgos 🟢 BAJO de la auditoría R2 (R2-06 … R2-12): aritmética de dinero en `bigint`, limpieza de feature muerta, fixes de UI/doc, restauración condicional de stock al cancelar, y cierre de un IDOR.

**Architecture:** Cambios acotados en `apps/api-core` (orders service/repo, kiosk service/controller, schema/doc) y `apps/ui` (settings form, kiosk store, cancel modal). El flujo de dinero queda homogéneo en centavos enteros (`bigint` backend, enteros en el kiosk). La restauración de stock reutiliza el guard race-safe existente de `cancelOrder`.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Jest (unit) + e2e real-DB; Astro + React + Zustand (UI), Vitest.

**Spec:** `apps/api-core/docs/superpowers/specs/2026-06-10-orders-kiosk-money-audit-bajos-design.md`

### Comandos de test (recordar)
- **API unit:** `docker compose exec res-api-core pnpm test -- <ruta>`
- **API e2e:** `docker compose exec res-api-core pnpm test:e2e -- <ruta>`
- **UI:** `docker compose exec -T res-ui node_modules/.bin/vitest run <ruta>` (baseline: ~13 fallas UI preexistentes, no relacionadas).

### File Structure
- `apps/api-core/src/orders/orders.service.ts` — R2-06 (bigint), R2-11 (llamada a restore).
- `apps/api-core/src/orders/order.repository.ts` — R2-06 (`CreateOrderData` bigint), R2-11 (`restoreStockForOrder`).
- `apps/api-core/src/kiosk/kiosk.service.ts` — R2-08 (quitar refs muertas).
- `apps/api-core/src/kiosk/kiosk.controller.ts` — R2-12 (filtrar por restaurantId).
- `apps/api-core/prisma/schema.postgresql.prisma` — R2-10 (comentario).
- `apps/api-core/docs/money-conversion.md` — R2-10.
- `apps/api-core/src/orders/orders.module.info.md` — R2-11, R2-12 (doc).
- `apps/api-core/src/kiosk/kiosk.module.info.md` — R2-08, R2-12 (doc).
- `CLAUDE.md` — R2-08.
- `apps/ui/src/components/kiosk/store/kiosk.store.ts` + nuevo `cart-total.ts` — R2-07.
- `apps/ui/src/components/dash/RestaurantSettingsForm.tsx` — R2-09.
- `apps/ui/src/components/dash/orders/CancelOrderModal.tsx` — R2-11 (cartel).

**Orden:** Task 1 (R2-06) y Task 2 (R2-07) están acoplados (centavos enteros) → hacerlos primero y juntos. El resto es independiente.

---

## Task 1: R2-06 — Aritmética de dinero en `bigint` end-to-end (backend)

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts:29-36` (tipo `OrderItemEntry`), `:357-408` (`validateAndBuildItems`, `validateExpectedTotal`), `:439-460` (`persistOrder`)
- Modify: `apps/api-core/src/orders/order.repository.ts:13-36` (`CreateOrderData`)
- Test (existente, safety net): `apps/api-core/test/orders/createOrderFromDashboard.e2e-spec.ts`, `apps/api-core/test/orders/raceConditions.e2e-spec.ts`

> **Nota de enfoque:** R2-06 es un refactor que **preserva comportamiento** (hoy ya es numéricamente correcto). TypeScript es el principal verificador (los tipos `bigint` deben encajar end-to-end) y los e2e real-DB existentes son la red de seguridad. No se inventa un unit test sobre métodos privados.

- [ ] **Step 1: Cambiar el tipo `OrderItemEntry` a `bigint`**

En `apps/api-core/src/orders/orders.service.ts:29-36`:

```ts
type OrderItemEntry = {
  productId: string;
  menuItemId?: string;
  quantity: number;
  unitPrice: bigint;
  subtotal: bigint;
  notes?: string;
};
```

- [ ] **Step 2: Operar `validateAndBuildItems` en `bigint`**

En `apps/api-core/src/orders/orders.service.ts:357-388`, cambiar la firma de retorno y la aritmética:

```ts
private async validateAndBuildItems(
  restaurantId: string,
  dto: CreateOrderDto,
  tx: Prisma.TransactionClient,
): Promise<{ orderItems: OrderItemEntry[]; stockEntries: StockEntry[]; totalAmount: bigint }> {
  const orderItems: OrderItemEntry[] = [];
  const stockEntries: StockEntry[] = [];

  for (const item of dto.items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product || product.restaurantId !== restaurantId) {
      throw new StockInsufficientException(item.productId, 0, item.quantity);
    }

    const unitPrice = product.price; // bigint, ya en centavos

    this.validateStock(product, item);

    orderItems.push({
      productId: item.productId,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice * BigInt(item.quantity),
      notes: item.notes,
    });
    stockEntries.push({ product, item });
  }

  const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0n);
  return { orderItems, stockEntries, totalAmount };
}
```

- [ ] **Step 3: Comparar `expectedTotal` como `bigint` directo**

En `apps/api-core/src/orders/orders.service.ts:399-408`:

```ts
private validateExpectedTotal(totalAmount: bigint, expectedTotal?: bigint): void {
  // Ambos lados en centavos bigint: igualdad exacta, sin BigInt(number) ni float.
  if (expectedTotal !== undefined && totalAmount !== expectedTotal) {
    throw new BadRequestException(
      'Los precios de tu pedido han cambiado. Por favor revisa el carrito e intenta de nuevo.',
    );
  }
}
```

- [ ] **Step 4: Propagar `bigint` en `persistOrder` y `CreateOrderData`**

En `apps/api-core/src/orders/orders.service.ts:439-447`, cambiar el tipo del param `totalAmount`:

```ts
private async persistOrder(
  params: {
    restaurantId: string;
    cashShiftId: string;
    totalAmount: bigint;
    dto: CreateOrderDto;
    orderItems: OrderItemEntry[];
    orderNumber: number;
  },
  tx: Prisma.TransactionClient,
) {
```

En `apps/api-core/src/orders/order.repository.ts:13-35`, cambiar `CreateOrderData`:

```ts
export interface CreateOrderData {
  orderNumber: number;
  totalAmount: bigint;
  restaurantId: string;
  cashShiftId: string;
  paymentMethod?: PaymentMethod;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReferences?: string;
  initialStatus?: OrderStatus;
  orderSource: string;
  orderType: string;
  tableNumber?: string;
  items: {
    productId: string;
    menuItemId?: string;
    quantity: number;
    unitPrice: bigint;
    subtotal: bigint;
    notes?: string;
  }[];
}
```

Las columnas Prisma (`totalAmount`, `unitPrice`, `subtotal`) son `BigInt`, así que aceptan `bigint` sin cambios en `createWithItems`.

- [ ] **Step 5: Compilar para verificar consistencia de tipos**

Run: `docker compose exec res-api-core pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 0 errores. Si aparece un `number`/`bigint` mismatch, corregir el call site que TS señale (ese es justamente el valor del refactor).

- [ ] **Step 6: Correr e2e de creación y carrera como red de seguridad**

Run: `docker compose exec res-api-core pnpm test:e2e -- test/orders/createOrderFromDashboard.e2e-spec.ts test/orders/raceConditions.e2e-spec.ts`
Expected: PASS (sin regresión; los totales y la validación de `expectedTotal` siguen correctos).

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/order.repository.ts
git commit -m "fix(orders): money arithmetic in bigint end-to-end (R2-06)"
```

---

## Task 2: R2-07 — `expectedTotal` del kiosk en centavos enteros (frontend)

**Files:**
- Create: `apps/ui/src/components/kiosk/store/cart-total.ts`
- Create (test): `apps/ui/src/components/kiosk/store/cart-total.test.ts`
- Modify: `apps/ui/src/components/kiosk/store/kiosk.store.ts:310`

> Se extrae el cálculo a un helper puro para poder testearlo sin montar el store ni mockear `kioskFetch`.

- [ ] **Step 1: Escribir el test del helper (falla: no existe)**

Crear `apps/ui/src/components/kiosk/store/cart-total.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cartTotalCents } from './cart-total';

describe('cartTotalCents', () => {
  it('suma precios enteros por cantidad', () => {
    expect(cartTotalCents([{ price: 1000, quantity: 2 }, { price: 500, quantity: 1 }])).toBe(2500);
  });

  it('redondea cada precio fraccionario a centavos enteros antes de sumar', () => {
    // 12.34 * 100 = 1234 ; 0.99 * 100 = 99
    expect(cartTotalCents([{ price: 12.34, quantity: 3 }, { price: 0.99, quantity: 5 }])).toBe(4197);
  });

  it('no acumula error de float en carritos grandes', () => {
    const cart = Array.from({ length: 1000 }, () => ({ price: 10.1, quantity: 1 }));
    expect(cartTotalCents(cart)).toBe(1010 * 1000);
  });

  it('devuelve 0 para carrito vacío', () => {
    expect(cartTotalCents([])).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/kiosk/store/cart-total.test.ts`
Expected: FAIL ("Failed to resolve import './cart-total'").

- [ ] **Step 3: Implementar el helper**

Crear `apps/ui/src/components/kiosk/store/cart-total.ts`:

```ts
/**
 * Suma el total del carrito en centavos enteros, espejando el cálculo del backend
 * (que opera en bigint centavos, audit R2-06). Cada precio en pesos se convierte a
 * centavos con un único Math.round por ítem para no acumular error de punto flotante.
 */
export function cartTotalCents(cart: { price: number; quantity: number }[]): number {
  return cart.reduce((sum, c) => sum + Math.round(c.price * 100) * c.quantity, 0);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/kiosk/store/cart-total.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Usar el helper en el store**

En `apps/ui/src/components/kiosk/store/kiosk.store.ts`, agregar el import al inicio del archivo:

```ts
import { cartTotalCents } from './cart-total';
```

Y reemplazar la línea `:310`:

```ts
// antes: expectedTotal: cart.reduce((s, c) => s + c.price * c.quantity, 0),
expectedTotal: cartTotalCents(cart),
```

- [ ] **Step 6: Verificar build de tipos UI**

Run: `docker compose exec -T res-ui node_modules/.bin/astro check 2>&1 | tail -5`
Expected: sin nuevos errores en `kiosk.store.ts` / `cart-total.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/components/kiosk/store/cart-total.ts apps/ui/src/components/kiosk/store/cart-total.test.ts apps/ui/src/components/kiosk/store/kiosk.store.ts
git commit -m "fix(kiosk): compute expectedTotal in integer cents (R2-07)"
```

---

## Task 3: R2-08 — Quitar referencias muertas a overrides de `MenuItem` (backend + doc)

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts:140,143`
- Modify: `CLAUDE.md:101`
- Modify: `apps/api-core/src/kiosk/kiosk.module.info.md`
- Test (existente): tests del kiosk

- [ ] **Step 1: Quitar los `??` muertos en `buildSections`**

En `apps/api-core/src/kiosk/kiosk.service.ts:140` y `:143`:

```ts
const effectiveStock = item.product.stock;
// Prices in DB are BigInt centavos; the kiosk API exposes them in pesos
// to match the convention of ProductListSerializer and the dashboard.
const price = fromCents(item.product.price);
```

- [ ] **Step 2: Barrer otras referencias a `item.price`/`item.stock` sobre MenuItem**

Run: `grep -rn "item.price\|item.stock\|priceOverride\|stockOverride" apps/api-core/src/kiosk/ apps/api-core/src/orders/`
Expected: sin más coincidencias sobre `MenuItem`. Si aparece alguna (tipos/serializer), quitarla del mismo modo.

- [ ] **Step 3: Corregir CLAUDE.md**

En `CLAUDE.md:101`, cambiar:

```
- `Menu` ←→ `Product` via `MenuItem` (pivot; sin overrides de precio/stock — la feature fue removida, el precio/stock sale del `Product`)
```

- [ ] **Step 4: Corregir `kiosk.module.info.md`**

Run: `grep -n "override\|price.*menu\|stock.*menu\|item.price\|item.stock" apps/api-core/src/kiosk/kiosk.module.info.md`
Para cada mención de overrides de `MenuItem`, reescribirla aclarando que el precio/stock proviene siempre del `Product` (la feature de override fue removida).

- [ ] **Step 5: Correr los tests del kiosk (sin regresión, comportamiento efectivo igual)**

Run: `docker compose exec res-api-core pnpm test -- src/kiosk`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/kiosk/kiosk.service.ts CLAUDE.md apps/api-core/src/kiosk/kiosk.module.info.md
git commit -m "refactor(kiosk): drop dead MenuItem override refs, fix docs (R2-08)"
```

---

## Task 4: R2-09 — Etiquetas del selector "Formato decimal" (frontend)

**Files:**
- Modify: `apps/ui/src/components/dash/RestaurantSettingsForm.tsx:155-162`

- [ ] **Step 1: Rotular por el separador decimal real**

En `apps/ui/src/components/dash/RestaurantSettingsForm.tsx:155-162`:

```tsx
<label className="inline-flex items-center mr-4">
  <input type="radio" value="," {...register('decimalSeparator')} />
  <span className="ml-2 text-sm">Coma decimal (1.234,56)</span>
</label>
<label className="inline-flex items-center">
  <input type="radio" value="." {...register('decimalSeparator')} />
  <span className="ml-2 text-sm">Punto decimal (1,234.56)</span>
</label>
```

- [ ] **Step 2: Ajustar tests/snapshots si existen**

Run: `grep -rn "Punto (1.234\|Coma (1,234\|Formato decimal" apps/ui/src`
Expected: si algún test afirma el texto viejo, actualizarlo al nuevo ("Coma decimal" / "Punto decimal").

- [ ] **Step 3: Verificar que el form renderiza sin error**

Run: `docker compose exec -T res-ui node_modules/.bin/astro check 2>&1 | tail -5`
Expected: sin nuevos errores en `RestaurantSettingsForm.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/RestaurantSettingsForm.tsx
git commit -m "fix(ui): label decimal-format options by decimal separator (R2-09)"
```

---

## Task 5: R2-10 — Documentar el modelo currency-agnostic (doc)

**Files:**
- Modify: `apps/api-core/prisma/schema.postgresql.prisma:105-111`
- Modify: `apps/api-core/docs/money-conversion.md`

> Solo documentación. No toca código de cálculo ni render.

- [ ] **Step 1: Reescribir el comentario del schema**

En `apps/api-core/prisma/schema.postgresql.prisma:105-111`:

```prisma
  // Display settings — usados por la UI para formatear montos.
  // El sistema es currency-agnostic: SIEMPRE opera con 2 decimales internos
  // (centavos ×100), sin importar la moneda. `currency` es solo una etiqueta de
  // display (símbolo); NO se respetan las minor units de ISO 4217 (p.ej. CLP/JPY
  // igual se renderizan con 2 decimales). Ocultar decimales por moneda, si se
  // quisiera, sería un cambio de frontend.
  country            String @default("CL") // ISO 3166-1 alpha-2; default para separadores
  currency           String @default("CLP") // código de moneda — solo etiqueta de display
  decimalSeparator   String @default(",")
  thousandsSeparator String @default(".")
```

- [ ] **Step 2: Documentar la suposición en `money-conversion.md`**

Agregar al final de `apps/api-core/docs/money-conversion.md` una sección:

```markdown
## Modelo currency-agnostic (siempre 2 decimales)

El dominio **siempre** opera con 2 decimales internos: los montos se guardan en
centavos (`BigInt`, factor ×100 fijo en `toCents`/`fromCents`). El sistema **no**
respeta las minor units de ISO 4217: una moneda sin decimales (CLP, JPY) igual se
almacena y renderiza con 2 decimales. El `currency` de `RestaurantSettings` es solo
una **etiqueta de display** (símbolo); los separadores son configuración de
presentación. Si en el futuro se quisiera ocultar los decimales para monedas enteras,
es un cambio de la capa de display (frontend), no del dominio.
```

- [ ] **Step 3: Verificar que el schema sigue válido**

Run: `docker compose exec res-api-core pnpm exec prisma validate --schema prisma/schema.postgresql.prisma`
Expected: "The schema is valid".

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/prisma/schema.postgresql.prisma apps/api-core/docs/money-conversion.md
git commit -m "docs: document currency-agnostic 2-decimal money model (R2-10)"
```

---

## Task 6: R2-11 — Restaurar stock al cancelar solo antes de cocinar (backend + doc + UI)

**Files:**
- Modify: `apps/api-core/src/orders/order.repository.ts` (nuevo `restoreStockForOrder`)
- Modify: `apps/api-core/src/orders/orders.service.ts:170-192` (`cancelOrder`)
- Test (unit): `apps/api-core/src/orders/orders.service.spec.ts` (describe `cancelOrder`)
- Test (e2e): `apps/api-core/test/orders/cancelOrder.e2e-spec.ts`
- Modify (doc): `apps/api-core/src/orders/orders.module.info.md:300-302`
- Modify (UI): `apps/ui/src/components/dash/orders/CancelOrderModal.tsx`

### 6a — Repositorio: `restoreStockForOrder`

- [ ] **Step 1: Agregar `restoreStockForOrder` al repositorio**

En `apps/api-core/src/orders/order.repository.ts`, agregar el método (después de `cancelOrderIfCancellable`):

```ts
/**
 * Restaura (incrementa) el stock de los ítems de una orden, espejando
 * decrementAllStock. El guard `stock: { not: null }` asegura que solo se toquen
 * productos con control de inventario (los que decrementaron al crear). Se ordena
 * por productId para mantener un orden de locks consistente (anti-deadlock).
 * La idempotencia la garantiza el llamador: solo se invoca cuando la cancelación
 * ganó la carrera (cancelOrderIfCancellable devolvió count===1).
 */
async restoreStockForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  const sorted = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
  for (const it of sorted) {
    await tx.product.updateMany({
      where: { id: it.productId, stock: { not: null } },
      data: { stock: { increment: it.quantity } },
    });
  }
}
```

### 6b — Servicio: llamar al restore solo en CREATED/CONFIRMED (TDD)

- [ ] **Step 2: Escribir los tests del servicio (fallan)**

En `apps/api-core/src/orders/orders.service.spec.ts`, dentro del `describe('cancelOrder', ...)`, añadir el mock del nuevo método y los casos. Primero, asegurar que `restoreStockForOrder: jest.fn()` esté en el `mockOrderRepository` (junto a `cancelOrderIfCancellable: jest.fn()` ~línea 25). Luego agregar:

```ts
it('restaura stock al cancelar una orden CREATED', async () => {
  stubTxWithOrders(makeOrder({ status: OrderStatus.CREATED, isPaid: false }));
  mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(1);
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));

  await service.cancelOrder('o1', 'r1', 'reason');

  expect(mockOrderRepository.restoreStockForOrder).toHaveBeenCalledWith(expect.anything(), 'o1');
});

it('restaura stock al cancelar una orden CONFIRMED', async () => {
  stubTxWithOrders(makeOrder({ status: OrderStatus.CONFIRMED, isPaid: false }));
  mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(1);
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));

  await service.cancelOrder('o1', 'r1', 'reason');

  expect(mockOrderRepository.restoreStockForOrder).toHaveBeenCalledWith(expect.anything(), 'o1');
});

it('NO restaura stock al cancelar una orden PROCESSING', async () => {
  stubTxWithOrders(makeOrder({ status: OrderStatus.PROCESSING, isPaid: false }));
  mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(1);
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));

  await service.cancelOrder('o1', 'r1', 'reason');

  expect(mockOrderRepository.restoreStockForOrder).not.toHaveBeenCalled();
});

it('NO restaura stock al cancelar una orden SERVED', async () => {
  stubTxWithOrders(makeOrder({ status: OrderStatus.SERVED, isPaid: false }));
  mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(1);
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));

  await service.cancelOrder('o1', 'r1', 'reason');

  expect(mockOrderRepository.restoreStockForOrder).not.toHaveBeenCalled();
});

it('NO restaura stock si pierde la carrera (count=0) en CREATED', async () => {
  // read inicial CREATED, luego re-read CREATED para el error preciso → InvalidStatusTransition
  stubTxWithOrders(
    makeOrder({ status: OrderStatus.CREATED, isPaid: false }),
    makeOrder({ status: OrderStatus.CREATED, isPaid: false }),
  );
  mockOrderRepository.cancelOrderIfCancellable.mockResolvedValue(0);

  await expect(service.cancelOrder('o1', 'r1', 'reason')).rejects.toThrow(InvalidStatusTransitionException);
  expect(mockOrderRepository.restoreStockForOrder).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `docker compose exec res-api-core pnpm test -- src/orders/orders.service.spec.ts -t cancelOrder`
Expected: FAIL (los casos CREATED/CONFIRMED fallan: `restoreStockForOrder` nunca se llama todavía).

- [ ] **Step 4: Implementar la llamada condicional en `cancelOrder`**

En `apps/api-core/src/orders/orders.service.ts`, dentro de la `$transaction` de `cancelOrder`, después del bloque `if (count === 0) { ... }` (cierre en `:191`) y antes de cerrar el callback de la transacción:

```ts
      // R2-11: restaurar stock solo si se canceló ANTES de cocinar. El corte coincide
      // con CONFIRMED→PROCESSING ("la comanda entra a cocina"). Idempotente porque solo
      // llegamos acá con count===1 (ganamos la única cancelación posible).
      if (
        order.status === OrderStatus.CREATED ||
        order.status === OrderStatus.CONFIRMED
      ) {
        await this.orderRepository.restoreStockForOrder(tx, id);
      }
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `docker compose exec res-api-core pnpm test -- src/orders/orders.service.spec.ts -t cancelOrder`
Expected: PASS (incluidos los nuevos 5 casos).

### 6c — e2e real-DB de restauración

- [ ] **Step 6: Agregar e2e de stock al cancelar**

En `apps/api-core/test/orders/cancelOrder.e2e-spec.ts`, agregar casos que: (1) creen un producto con `stock` finito, (2) creen una orden que lo consuma, (3) cancelen y verifiquen el stock. Seguir el patrón de setup del archivo (`apps/api-core/test/orders/orders.helpers.ts`). Casos:

```ts
it('restaura el stock al cancelar una orden CREATED', async () => {
  // producto con stock 10; orden consume 3 → stock 7; cancelar (CREATED) → stock 10
  // ... setup con helpers existentes ...
  // expect(productoTrasCancel.stock).toBe(10);
});

it('NO restaura el stock al cancelar una orden PROCESSING', async () => {
  // producto stock 10; orden consume 3 → 7; avanzar a PROCESSING; cancelar → sigue 7
  // expect(productoTrasCancel.stock).toBe(7);
});

it('no toca productos con stock=null (sin control de inventario)', async () => {
  // producto con stock=null; orden; cancelar CREATED → stock sigue null
  // expect(productoTrasCancel.stock).toBeNull();
});
```

> El cuerpo concreto se completa con los helpers del archivo (crear restaurante/turno/producto/orden). Mantener el estilo de los `it` existentes en `cancelOrder.e2e-spec.ts`.

- [ ] **Step 7: Correr el e2e de cancel**

Run: `docker compose exec res-api-core pnpm test:e2e -- test/orders/cancelOrder.e2e-spec.ts`
Expected: PASS.

### 6d — Documentación de la regla

- [ ] **Step 8: Documentar en `orders.module.info.md`**

En `apps/api-core/src/orders/orders.module.info.md:300-302`, ampliar la sección de cancelación:

```markdown
  - Cancelación: desde `CREATED`, `CONFIRMED`, `PROCESSING` o `SERVED` → `CANCELLED`
  - `COMPLETED` no puede cancelarse; tampoco una orden pagada (`isPaid=true`)
  - **Stock al cancelar (R2-11):** si la orden estaba en `CREATED` o `CONFIRMED`
    (aún no entró a cocina), el stock de los ítems se **restaura** al inventario
    dentro de la misma transacción (espejo de `decrementAllStock`, solo productos
    con `stock !== null`, idempotente vía el guard `cancelOrderIfCancellable`). Si
    estaba en `PROCESSING`/`SERVED`, el stock **no** se restaura (se asume que el
    insumo ya se consumió).
```

### 6e — Cartel estático en el modal de cancelación

- [ ] **Step 9: Agregar el cartel informativo a `CancelOrderModal`**

En `apps/ui/src/components/dash/orders/CancelOrderModal.tsx`, dentro del `<div className="bg-white ...">`, justo después del `<h3>Cancelar pedido</h3>` (línea 34):

```tsx
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
          ℹ️ Si el pedido aún no entró a cocina (Creado o Confirmado), el stock de los
          productos se restaurará al inventario. Si ya está En preparación o Servido, el
          stock no se devuelve.
        </p>
```

- [ ] **Step 10: Verificar UI build**

Run: `docker compose exec -T res-ui node_modules/.bin/astro check 2>&1 | tail -5`
Expected: sin nuevos errores en `CancelOrderModal.tsx`.

- [ ] **Step 11: Commit**

```bash
git add apps/api-core/src/orders/order.repository.ts apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.service.spec.ts apps/api-core/test/orders/cancelOrder.e2e-spec.ts apps/api-core/src/orders/orders.module.info.md apps/ui/src/components/dash/orders/CancelOrderModal.tsx
git commit -m "feat(orders): restore stock on cancel before kitchen (R2-11)"
```

---

## Task 7: R2-12 — Cerrar el IDOR del endpoint público de estado de orden (backend)

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.controller.ts:78-96`
- Test (e2e): `apps/api-core/test/kiosk/kioskOrderStatus.e2e-spec.ts` (helpers en `apps/api-core/test/kiosk/kiosk.helpers.ts`)
- Modify (doc): `apps/api-core/src/kiosk/kiosk.module.info.md:202`

- [ ] **Step 1: Revisar el setup del e2e existente**

Run: `cat apps/api-core/test/kiosk/kioskOrderStatus.e2e-spec.ts apps/api-core/test/kiosk/kiosk.helpers.ts`
Identificar cómo el archivo crea restaurante/slug/orden (helpers de `kiosk.helpers.ts`) para reusarlos en el nuevo caso de dos restaurantes.

- [ ] **Step 2: Escribir el e2e de no-pertenencia (falla)**

Añadir a `apps/api-core/test/kiosk/kioskOrderStatus.e2e-spec.ts` un caso que cree DOS restaurantes (A y B), una orden en B, y consulte `GET /v1/kiosk/<slugA>/orders/<orderId_de_B>` esperando 404. Seguir el patrón de setup del archivo:

```ts
it('devuelve 404 si la orden no pertenece al restaurante del slug', async () => {
  // crear restaurante A (slugA) y restaurante B (slugB) con su turno abierto
  // crear orden en B → orderIdB
  const res = await request(app.getHttpServer())
    .get(`/v1/kiosk/${slugA}/orders/${orderIdB}`)
    .expect(404);
});

it('devuelve 200 para una orden del propio restaurante del slug', async () => {
  // crear orden en A → orderIdA
  await request(app.getHttpServer())
    .get(`/v1/kiosk/${slugA}/orders/${orderIdA}`)
    .expect(200);
});
```

- [ ] **Step 3: Correr el e2e para verificar que el caso de 404 falla**

Run: `docker compose exec res-api-core pnpm test:e2e -- test/kiosk/kioskOrderStatus.e2e-spec.ts`
Expected: FAIL en el caso de no-pertenencia (hoy devuelve 200 con datos ajenos).

- [ ] **Step 4: Filtrar por restaurantId en el controller**

En `apps/api-core/src/kiosk/kiosk.controller.ts:78-96`:

```ts
  async getOrderStatus(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
  ) {
    const restaurant = await this.kioskService.resolveRestaurant(slug);
    const order = await this.orderRepository.findById(orderId);
    if (!order || order.restaurantId !== restaurant.id) {
      throw new EntityNotFoundException('Order', orderId);
    }
    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      items: orderWithItems.items,
      createdAt: order.createdAt,
    };
  }
```

> Verificar que `resolveRestaurant(slug)` retorna un objeto con `.id` (es el restaurante resuelto). Si `OrderSerializer.restaurantId` no estuviera disponible en el retorno de `findById`, usar la propiedad equivalente que exponga el serializer.

- [ ] **Step 5: Correr el e2e para verificar que pasa**

Run: `docker compose exec res-api-core pnpm test:e2e -- test/kiosk/kioskOrderStatus.e2e-spec.ts`
Expected: PASS (404 para ajena, 200 para propia).

- [ ] **Step 6: Actualizar la doc**

En `apps/api-core/src/kiosk/kiosk.module.info.md:202`, cambiar la nota que decía que el no-filtrado era intencional: ahora el endpoint **valida pertenencia** al restaurante del slug y devuelve 404 si la orden es de otro restaurante (cierre del IDOR, R2-12).

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/kiosk/kiosk.controller.ts apps/api-core/src/kiosk/kiosk.module.info.md apps/api-core/test/kiosk/kioskOrderStatus.e2e-spec.ts
git commit -m "fix(kiosk): scope public order-status endpoint by restaurant (R2-12)"
```

---

## Cierre

- [ ] **Step final 1: Suite completa API**

Run: `docker compose exec res-api-core pnpm test && docker compose exec res-api-core pnpm test:e2e -- test/orders test/kiosk`
Expected: PASS.

- [ ] **Step final 2: Marcar resueltos en el spec madre**

En `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`, marcar R2-06…R2-12 como ✅ RESUELTOS (2026-06-10) con referencia a este plan, y actualizar el resumen ejecutivo (BAJO: 7 → 0 pendientes).

- [ ] **Step final 3: Commit del cierre y PR**

```bash
git add apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md
git commit -m "docs: mark R2 BAJO findings resolved (R2-06..R2-12)"
gh pr create --base develop --title "fix(orders/kiosk): resolve R2 BAJO audit findings (R2-06..R2-12)" --body "Resuelve los 7 hallazgos BAJO de la auditoría R2. Ver plan: apps/api-core/docs/superpowers/plans/2026-06-10-orders-kiosk-money-audit-bajos.md"
```
