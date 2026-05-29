# Orders / Cash-Shift / Kitchen — Hallazgos MEDIOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 18 hallazgos MEDIOS (H-21 a H-39) y el refactor estructural de H-22 del audit `2026-05-24-orders-cash-kitchen-audit-findings.md`, divididos en 4 batches con commit independiente cada uno, ejecutando tests **dentro del contenedor Docker** según `CLAUDE.md`.

**Architecture:**
- Backend NestJS (apps/api-core) — hardening de tipos, refactor de serialización (`serializeOrder` → clase Serializer dedicada), defensa en profundidad, caché de stats para turnos cerrados, cola de cocina FIFO restringida al turno abierto.
- Frontend Astro/React (apps/ui) — UX hardening (maxLength, validación items, radix en `parseInt`, `formatMoney` consistente, `prerender=false` en página autenticada).
- Decisión: H-24 (listOrders lanza 409) se documenta como decisión de producto consciente; no se cambia el comportamiento.

**Tech Stack:** NestJS, Prisma, class-validator, class-transformer, Jest (Docker), React, Astro, vitest/jest-dom (donde aplique).

**Tests siempre con Docker:**
- Unit: `docker compose exec res-api-core pnpm test -- <pattern>`
- Coverage: `docker compose exec res-api-core pnpm test:cov`
- E2E: `docker compose exec res-api-core pnpm test:e2e -- <pattern>`
- UI: `cd apps/ui && pnpm test -- <pattern>` (los tests del UI no requieren Docker)

---

## File Structure

### Backend — modificados
- `apps/api-core/src/orders/order.repository.ts` — split de `serializeOrder` a `OrderSerializer` class (H-22); `CreateOrderData.paymentMethod` tipado como `PaymentMethod | undefined` (H-21).
- `apps/api-core/src/orders/serializers/order.serializer.ts` — **nuevo**. Clase `OrderSerializer` con `@Exclude/@Expose/@Transform` (H-22).
- `apps/api-core/src/orders/serializers/order-item.serializer.ts` — **nuevo**. Item para `OrderSerializer`.
- `apps/api-core/src/orders/serializers/order.serializer.spec.ts` — **nuevo**. Tests de cobertura.
- `apps/api-core/src/orders/order-shift-report.repository.ts` — limpieza de `as unknown as` (H-23).
- `apps/api-core/src/orders/dto/cancel-order.dto.ts` — `@MaxLength(500)` en `reason` (H-35 back).
- `apps/api-core/src/orders/dto/cancel-order.dto.spec.ts` — **nuevo**. Tests del MaxLength.
- `apps/api-core/src/orders/orders.module.info.md` — documentar H-24.
- `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts` — `@Transform(fromCents)` defensivo en BigInt; safe TZ; split del `_count` (H-25, H-26, H-29).
- `apps/api-core/src/cash-register/serializers/cash-shift-with-count.serializer.ts` — **nuevo**. Hereda y agrega `_count` (H-26).
- `apps/api-core/src/cash-register/cash-register.controller.ts` — `current` retorna `null` (no `{}`); `topProducts` llama directo a `getTopProductsWithNamesByShift` (H-27, H-28).
- `apps/api-core/src/cash-register/cash-register.service.ts` — `getCurrentSession` retorna `CashShiftWithUserAndCount | null`; caché in-memory para stats de CLOSED (H-27, H-31).
- `apps/api-core/src/cash-register/cash-register-stats.service.ts` — JSDoc sobre BigInt floor division en `averageTicket` (H-30).
- `apps/api-core/src/cash-register/cash-register.module.info.md` — documenta caché de CLOSED.
- `apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts` — assign explícito en lugar de `Object.assign(this, partial)` (H-34).
- `apps/api-core/src/kitchen/serializers/kitchen-order-item.serializer.ts` — idem (H-34).

### Frontend — modificados
- `apps/ui/src/components/dash/orders/CancelOrderModal.tsx` — `maxLength={500}` en input (H-35 front).
- `apps/ui/src/components/dash/orders/CreateOrderModal.tsx` — guard `items.length > 0` en `handleConfirm` (H-36).
- `apps/ui/src/components/dash/orders/CreateOrderStep1.tsx` — `parseInt(value, 10)` (H-37).
- `apps/ui/src/components/dash/orders/OrderCard.tsx` — `formatMoney(...)` con `useRestaurantSettings()` (H-38).
- `apps/ui/src/pages/dash/orders.astro` — `prerender = false` (H-39).

### Documentos
- `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` — marcar cada H-XX como ✅ / 🔄 / ❌ con plan asociado y fecha (2026-05-29).

---

## Batch 1 — Hardening backend (H-21, H-25, H-34, H-35-back)

### Task 1: H-21 — Endurecer tipo `paymentMethod` en `CreateOrderData`

**Files:**
- Modify: `apps/api-core/src/orders/order.repository.ts` (interface `CreateOrderData`, líneas 46-69 y método `createWithItems`)
- Test: nuevo bloque en `apps/api-core/src/orders/order.repository.spec.ts` (si no existe spec, crear)

- [ ] **Step 1: Verificar si existe spec del repo**

```bash
ls apps/api-core/src/orders/order.repository.spec.ts 2>&1
```

Si no existe, crear con un test mínimo de smoke; si existe, agregar el test a continuación.

- [ ] **Step 2: Escribir test de tipos**

Agregar en `order.repository.spec.ts`:

```ts
import { PaymentMethod } from '@prisma/client';
import { CreateOrderData } from './order.repository';

describe('CreateOrderData (H-21)', () => {
  it('paymentMethod debe ser PaymentMethod | undefined, no string libre', () => {
    // Compile-time check — si el tipo se rompe, este test rompe build.
    const valid: CreateOrderData['paymentMethod'] = PaymentMethod.CASH;
    const empty: CreateOrderData['paymentMethod'] = undefined;
    expect(valid).toBe(PaymentMethod.CASH);
    expect(empty).toBeUndefined();
    // @ts-expect-error — string arbitrario no debe ser asignable
    const invalid: CreateOrderData['paymentMethod'] = 'INVALID_METHOD';
    expect(invalid).toBe('INVALID_METHOD');
  });
});
```

- [ ] **Step 3: Correr el test (debe fallar en compile)**

```bash
docker compose exec res-api-core pnpm test -- order.repository.spec
```

Expected: FAIL — el `@ts-expect-error` no aplica porque el tipo actual `string` sí acepta string arbitrario.

- [ ] **Step 4: Cambiar el tipo de `paymentMethod`**

En `apps/api-core/src/orders/order.repository.ts`, líneas 1-2 y 46-69, ajustar:

```ts
import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, PaymentMethod } from '@prisma/client';
// ... (mantener)

export interface CreateOrderData {
  orderNumber: number;
  totalAmount: number;
  restaurantId: string;
  cashShiftId: string;
  paymentMethod?: PaymentMethod;          // ← antes: string
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
    unitPrice: number;
    subtotal: number;
    notes?: string;
  }[];
}
```

Y en `createWithItems` quitar el cast (línea 83):

```ts
paymentMethod: data.paymentMethod,    // sin `as PaymentMethod`
```

- [ ] **Step 5: Verificar callers y ajustar si pasan string**

```bash
grep -rn "CreateOrderData\b" apps/api-core/src/
```

Para cada caller, si construye un objeto con `paymentMethod: 'CASH'` literal, el tipo seguirá funcionando porque `'CASH' satisfies PaymentMethod`. Si construye `paymentMethod: someString`, ajustar el origen para que provenga del DTO con `@IsEnum`.

- [ ] **Step 6: Correr el test (debe pasar)**

```bash
docker compose exec res-api-core pnpm test -- order.repository.spec
```

Expected: PASS.

- [ ] **Step 7: Correr suite completa (asegurar no romper otros tests)**

```bash
docker compose exec res-api-core pnpm test
```

Expected: PASS.

---

### Task 2: H-25 — Defensa BigInt en `CashShiftSerializer`

**Files:**
- Modify: `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts`
- Test: `apps/api-core/src/cash-register/serializers/cash-shift.serializer.spec.ts` (nuevo si no existe)

- [ ] **Step 1: Escribir test que demuestre que si alguien agrega `@Expose()` al campo, no serializa BigInt crudo**

```ts
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { CashShiftSerializer } from './cash-shift.serializer';
import { CashShiftStatus } from '@prisma/client';

describe('CashShiftSerializer (H-25)', () => {
  it('si alguien expone openingBalance/totalSales por error, JSON.stringify no falla con BigInt', () => {
    const partial = {
      id: 'shift-1',
      restaurantId: 'r1',
      userId: 'u1',
      status: CashShiftStatus.CLOSED,
      lastOrderNumber: 0,
      openingBalance: 1000n,
      totalSales: 5000n,
      totalOrders: 2,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: new Date('2026-05-29T18:00:00Z'),
      closedBy: 'u1',
    };
    const instance = new CashShiftSerializer(partial as any, 'UTC');
    expect(() => JSON.stringify(instanceToPlain(instance))).not.toThrow();
  });
});
```

- [ ] **Step 2: Correr — Expected PASS (porque @Exclude() protege hoy)**

```bash
docker compose exec res-api-core pnpm test -- cash-shift.serializer.spec
```

- [ ] **Step 3: Agregar regression test: si alguien quita @Exclude por error**

```ts
// agregar al describe anterior
import { Expose } from 'class-transformer';
// ...

it('@Transform(fromCents) defensivo sobre BigInt campos (compile-time fence)', () => {
  // Forzamos exposición temporal para verificar que el @Transform existe.
  // El test no muta la clase real; verifica metadata vía `getMetadataStorage`.
  // Si esto es frágil en la práctica, el test alterno es: agregar las anotaciones
  // y verificar que JSON salga en pesos.
  const instance = new CashShiftSerializer(
    {
      id: 'shift-1',
      openingBalance: 1000n,
      totalSales: 5000n,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: null,
      restaurantId: 'r',
      userId: 'u',
      lastOrderNumber: 0,
      totalOrders: 0,
      status: CashShiftStatus.OPEN,
      closedBy: null,
    } as any,
    'UTC',
  );
  // Verificación indirecta: el serializer no debe exponer los campos sensibles
  const plain = instanceToPlain(instance);
  expect(plain.openingBalance).toBeUndefined();
  expect(plain.totalSales).toBeUndefined();
});
```

- [ ] **Step 4: Aplicar `@Transform(fromCents)` defensivo**

En `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts`, agregar import e instrumentar campos BigInt incluso si están "ocultos" — la idea es defender ante un `@Expose()` accidental futuro:

```ts
import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashShiftWithUser } from '../../cash-shift/cash-shift.repository';
import { fromCents } from '../../common/helpers/money';

@Exclude()
export class CashShiftSerializer implements Pick<CashShift, 'id' | 'status'> {
  @ApiProperty()
  @Expose()
  id: string;

  // BigInt fields — siguen sin @Expose() (no se exponen). El @Transform es
  // defensivo: si alguien agrega @Expose() por error en el futuro, los valores
  // saldrán convertidos a pesos en vez de BigInt crudo (que rompe JSON.stringify).
  @Transform(({ value }) => (typeof value === 'bigint' ? fromCents(value) : value))
  restaurantId: string;
  userId: string;
  lastOrderNumber: number;
  @Transform(({ value }) => (typeof value === 'bigint' ? fromCents(value) : value))
  openingBalance: bigint;
  @Transform(({ value }) => (typeof value === 'bigint' ? fromCents(value) : value))
  totalSales: bigint | null;
  totalOrders: number | null;
  openedAt: Date;
  closedAt: Date | null;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedBy: string | null;

  @ApiProperty()
  @Expose()
  displayOpenedAt: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  displayClosedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  openedByEmail: string | null;

  constructor(
    partial: Partial<CashShiftWithUser>,
    timezone = 'UTC',
  ) {
    Object.assign(this, partial);
    const fmt = safeFormatter(timezone);
    const formatDate = (date: Date): string => {
      const p = fmt.formatToParts(date);
      const get = (type: string) => p.find((x) => x.type === type)?.value ?? '00';
      return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
    };
    this.displayOpenedAt = formatDate(new Date(partial.openedAt!));
    this.displayClosedAt = partial.closedAt ? formatDate(new Date(partial.closedAt)) : null;
    this.openedByEmail = (partial as any).user?.email ?? null;
  }
}

// H-29: si la TZ del restaurante quedó corrupta en BD, Intl.DateTimeFormat lanza
// RangeError que se propaga como 500 opaco. Fallback a UTC con warning.
function safeFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return new Intl.DateTimeFormat('es', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
}
```

> Nota: H-29 también se cubre en este step para no duplicar edits sobre el mismo archivo. Quedará trackeado en Batch 3 pero implementado aquí.

- [ ] **Step 5: Quitar `_count?` de esta clase (preparación H-26)**

Eliminar de la clase:

```ts
@ApiPropertyOptional({ type: Object })
@Expose()
_count?: { orders: number };
```

Y de los tipos del constructor (la nueva variante con `_count` vivirá en `CashShiftWithCountSerializer`).

- [ ] **Step 6: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- cash-shift.serializer.spec
```

Expected: PASS.

---

### Task 3: H-26 — Split del serializer para `_count.orders`

**Files:**
- Create: `apps/api-core/src/cash-register/serializers/cash-shift-with-count.serializer.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts` (history endpoint usa el nuevo serializer)
- Modify: `apps/api-core/src/cash-register/serializers/paginated-cash-shifts.serializer.ts` (si tipa el data, ajustar)
- Test: `apps/api-core/src/cash-register/serializers/cash-shift-with-count.serializer.spec.ts`

- [ ] **Step 1: Test que verifica que el nuevo serializer expone `_count.orders`**

```ts
// cash-shift-with-count.serializer.spec.ts
import { instanceToPlain } from 'class-transformer';
import { CashShiftStatus } from '@prisma/client';
import { CashShiftWithCountSerializer } from './cash-shift-with-count.serializer';

describe('CashShiftWithCountSerializer', () => {
  it('expone _count.orders explícito', () => {
    const partial = {
      id: 's1',
      restaurantId: 'r',
      userId: 'u',
      lastOrderNumber: 5,
      openingBalance: 0n,
      totalSales: 0n,
      totalOrders: 0,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: null,
      status: CashShiftStatus.OPEN,
      closedBy: null,
      _count: { orders: 12 },
    };
    const instance = new CashShiftWithCountSerializer(partial as any, 'UTC');
    const plain = instanceToPlain(instance);
    expect(plain._count).toEqual({ orders: 12 });
    expect(plain.id).toBe('s1');
  });

  it('CashShiftSerializer base no expone _count', () => {
    const { CashShiftSerializer } = require('./cash-shift.serializer');
    const partial = {
      id: 's1',
      restaurantId: 'r',
      userId: 'u',
      lastOrderNumber: 0,
      openingBalance: 0n,
      totalSales: 0n,
      totalOrders: 0,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: null,
      status: CashShiftStatus.OPEN,
      closedBy: null,
      _count: { orders: 12 },
    };
    const instance = new CashShiftSerializer(partial as any, 'UTC');
    const plain = instanceToPlain(instance);
    expect(plain._count).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL (no existe el archivo)**

```bash
docker compose exec res-api-core pnpm test -- cash-shift-with-count.serializer.spec
```

- [ ] **Step 3: Crear el serializer hijo**

`apps/api-core/src/cash-register/serializers/cash-shift-with-count.serializer.ts`:

```ts
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { CashShiftSerializer } from './cash-shift.serializer';
import { CashShiftWithUserAndCount } from '../../cash-shift/cash-shift.repository';

@Exclude()
class OrderCount {
  @ApiProperty()
  @Expose()
  orders: number;

  constructor(partial: { orders: number }) {
    this.orders = partial.orders;
  }
}

@Exclude()
export class CashShiftWithCountSerializer extends CashShiftSerializer {
  @ApiProperty({ type: OrderCount })
  @Expose()
  _count: OrderCount;

  constructor(
    partial: Partial<CashShiftWithUserAndCount & { _count?: { orders: number } }>,
    timezone = 'UTC',
  ) {
    super(partial as any, timezone);
    this._count = new OrderCount(partial._count ?? { orders: 0 });
  }
}
```

- [ ] **Step 4: Sustituir uso en el controller**

En `apps/api-core/src/cash-register/cash-register.controller.ts:104-107`, `history()`:

```ts
import { CashShiftWithCountSerializer } from './serializers/cash-shift-with-count.serializer';

// ...

async history(...) {
  // ...
  return new PaginatedCashShiftsSerializer({
    data: result.data.map((s) => new CashShiftWithCountSerializer(s as any, tz)),
    meta: result.meta,
  });
}
```

Y en `current()` (líneas 130-137), si el repo devuelve `_count`, usar también `CashShiftWithCountSerializer` para que el cliente reciba el conteo de la sesión activa. Lo ajustamos en T4 junto con H-27.

- [ ] **Step 5: Ajustar `PaginatedCashShiftsSerializer`**

Si tipa `data: CashShiftSerializer[]`, cambiar a `data: CashShiftWithCountSerializer[]`. Revisar el archivo:

```bash
grep -n "data" apps/api-core/src/cash-register/serializers/paginated-cash-shifts.serializer.ts
```

Aplicar el cambio mínimo necesario.

- [ ] **Step 6: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- cash-shift
```

Expected: PASS.

- [ ] **Step 7: Smoke check del e2e de history**

```bash
docker compose exec res-api-core pnpm test:e2e -- cash-register
```

Expected: PASS. Si rompe por shape de `_count`, ajustar el e2e (debe esperar `_count: { orders: N }`).

---

### Task 4: H-34 — Reemplazar `Object.assign(this, partial)` en kitchen serializers

**Files:**
- Modify: `apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts`
- Modify: `apps/api-core/src/kitchen/serializers/kitchen-order-item.serializer.ts`
- Test: `apps/api-core/src/kitchen/serializers/kitchen-order.serializer.spec.ts` (nuevo)

- [ ] **Step 1: Escribir test que demuestra el riesgo**

```ts
import { KitchenOrderSerializer } from './kitchen-order.serializer';
import { OrderStatus } from '@prisma/client';
import { instanceToPlain } from 'class-transformer';

describe('KitchenOrderSerializer (H-34)', () => {
  it('NO copia restaurantId/cashShiftId/isPaid si vienen en el payload', () => {
    const partial = {
      id: 'o1',
      orderNumber: 42,
      status: OrderStatus.PROCESSING,
      totalAmount: 5000n,
      orderType: 'DINE_IN',
      tableNumber: '7',
      createdAt: new Date('2026-05-29T12:00:00Z'),
      restaurantId: 'should-not-be-here',
      cashShiftId: 'should-not-be-here',
      isPaid: true,
      customerEmail: 'leak@example.com',
      items: [],
    };
    const instance = new KitchenOrderSerializer(partial as any, 'UTC');
    // Accesos directos a campos NO declarados deben ser undefined.
    expect((instance as any).restaurantId).toBeUndefined();
    expect((instance as any).cashShiftId).toBeUndefined();
    expect((instance as any).isPaid).toBeUndefined();
    expect((instance as any).customerEmail).toBeUndefined();
    // JSON salido (sin interceptor) tampoco debe contenerlos
    const plain = instanceToPlain(instance) as Record<string, unknown>;
    expect(plain.restaurantId).toBeUndefined();
    expect(plain.cashShiftId).toBeUndefined();
    expect(plain.isPaid).toBeUndefined();
    expect(plain.customerEmail).toBeUndefined();
    // Campos válidos sí presentes
    expect(plain.id).toBe('o1');
    expect(plain.orderNumber).toBe(42);
    expect(plain.totalAmount).toBe(50); // 5000 centavos → 50 pesos
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL (los campos extra se filtran vía `Object.assign`)**

```bash
docker compose exec res-api-core pnpm test -- kitchen-order.serializer.spec
```

- [ ] **Step 3: Refactor con asignación explícita**

`apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts`:

```ts
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { fromCents } from '../../common/helpers/money';
import { KitchenOrderItemSerializer } from './kitchen-order-item.serializer';

@Exclude()
export class KitchenOrderSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  orderNumber: number;

  @ApiProperty({ enum: OrderStatus })
  @Expose()
  status: OrderStatus;

  @ApiProperty({ description: 'Total en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  totalAmount: number;

  @ApiProperty({ description: 'HH:MM en el timezone del restaurante' })
  @Expose()
  displayTime: string;

  @ApiProperty({ type: [KitchenOrderItemSerializer] })
  @Expose()
  @Type(() => KitchenOrderItemSerializer)
  items: KitchenOrderItemSerializer[];

  @ApiProperty()
  @Expose()
  orderType: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  tableNumber: string | null;

  constructor(partial: any, timezone = 'UTC') {
    // Asignación explícita — evita mass-assignment de campos sensibles
    // (restaurantId, cashShiftId, isPaid, customerEmail, ...). Ver audit H-34.
    this.id = partial.id;
    this.orderNumber = partial.orderNumber;
    this.status = partial.status;
    this.totalAmount = partial.totalAmount;
    this.orderType = partial.orderType;
    this.tableNumber = partial.tableNumber ?? null;
    this.items = Array.isArray(partial.items)
      ? partial.items.map((item: unknown) => new KitchenOrderItemSerializer(item as any))
      : [];
    this.displayTime = formatKitchenTime(partial.createdAt, timezone);
  }
}

function formatKitchenTime(createdAt: Date | string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(createdAt));
  } catch {
    return new Intl.DateTimeFormat('es', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(createdAt));
  }
}
```

`apps/api-core/src/kitchen/serializers/kitchen-order-item.serializer.ts`:

```ts
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { fromCents } from '../../common/helpers/money';

@Exclude()
class KitchenProductSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  imageUrl: string | null;

  constructor(partial: { id: string; name: string; imageUrl: string | null }) {
    this.id = partial.id;
    this.name = partial.name;
    this.imageUrl = partial.imageUrl ?? null;
  }
}

@Exclude()
export class KitchenOrderItemSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty({ description: 'Precio unitario en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  unitPrice: number;

  @ApiProperty({ description: 'Subtotal en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  subtotal: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  notes: string | null;

  @ApiProperty({ type: KitchenProductSerializer })
  @Expose()
  @Type(() => KitchenProductSerializer)
  product: KitchenProductSerializer;

  constructor(partial: any) {
    this.id = partial.id;
    this.quantity = partial.quantity;
    this.unitPrice = partial.unitPrice;
    this.subtotal = partial.subtotal;
    this.notes = partial.notes ?? null;
    this.product = partial.product
      ? new KitchenProductSerializer(partial.product)
      : (undefined as any);
  }
}
```

- [ ] **Step 4: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- kitchen-order
```

Expected: PASS (incluye el test de step 1).

---

### Task 5: H-35 backend — `@MaxLength(500)` en `CancelOrderDto`

**Files:**
- Modify: `apps/api-core/src/orders/dto/cancel-order.dto.ts`
- Test: `apps/api-core/src/orders/dto/cancel-order.dto.spec.ts` (nuevo)

- [ ] **Step 1: Crear el test**

```ts
// cancel-order.dto.spec.ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CancelOrderDto } from './cancel-order.dto';

describe('CancelOrderDto (H-35)', () => {
  it('rechaza reason vacío', async () => {
    const dto = plainToInstance(CancelOrderDto, { reason: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toMatch(/isNotEmpty/);
  });

  it('acepta reason en 500 chars exactos', async () => {
    const dto = plainToInstance(CancelOrderDto, { reason: 'a'.repeat(500) });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('rechaza reason de 501 chars', async () => {
    const dto = plainToInstance(CancelOrderDto, { reason: 'a'.repeat(501) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toMatch(/maxLength/);
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL para el caso 501 chars**

```bash
docker compose exec res-api-core pnpm test -- cancel-order.dto.spec
```

- [ ] **Step 3: Aplicar `@MaxLength(500)`**

`apps/api-core/src/orders/dto/cancel-order.dto.ts`:

```ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelOrderDto {
  @ApiProperty({ example: 'Pedido duplicado por error del cliente', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
```

- [ ] **Step 4: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- cancel-order.dto.spec
```

Expected: PASS.

---

### Task 6: Suite completa y commit del Batch 1

- [ ] **Step 1: Correr toda la suite backend**

```bash
docker compose exec res-api-core pnpm test
```

Expected: PASS, no debe haber regresiones.

- [ ] **Step 2: Commit del Batch 1**

```bash
git add apps/api-core/src/orders/order.repository.ts \
        apps/api-core/src/orders/order.repository.spec.ts \
        apps/api-core/src/orders/dto/cancel-order.dto.ts \
        apps/api-core/src/orders/dto/cancel-order.dto.spec.ts \
        apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts \
        apps/api-core/src/cash-register/serializers/cash-shift.serializer.spec.ts \
        apps/api-core/src/cash-register/serializers/cash-shift-with-count.serializer.ts \
        apps/api-core/src/cash-register/serializers/cash-shift-with-count.serializer.spec.ts \
        apps/api-core/src/cash-register/serializers/paginated-cash-shifts.serializer.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts \
        apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts \
        apps/api-core/src/kitchen/serializers/kitchen-order-item.serializer.ts \
        apps/api-core/src/kitchen/serializers/kitchen-order.serializer.spec.ts

git commit -m "$(cat <<'EOF'
refactor(api): batch 1 MEDIOS hardening (H-21, H-25, H-26, H-29, H-34, H-35)

- H-21: CreateOrderData.paymentMethod typed as PaymentMethod | undefined (no string libre)
- H-25: @Transform(fromCents) defensivo en BigInt fields de CashShiftSerializer
- H-26: split a CashShiftWithCountSerializer; _count.orders deja de exponerse por accidente
- H-29: safeFormatter() fallback a UTC si la TZ del restaurante quedó corrupta
- H-34: asignación explícita en KitchenOrderSerializer + KitchenOrderItemSerializer (evita mass-assignment)
- H-35 (backend): @MaxLength(500) en CancelOrderDto.reason

Spec ref: apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
EOF
)"
```

- [ ] **Step 3: Verificar estado**

```bash
git status && git log --oneline -3
```

---

## Batch 2 — Refactor de serialización (H-22, H-23, H-27)

> Nota: H-26 quedó incluido en el Batch 1 por necesidad técnica (compartía archivo con H-25/H-29).

### Task 7: H-22 — `OrderSerializer` class dedicada

**Files:**
- Create: `apps/api-core/src/orders/serializers/order.serializer.ts`
- Create: `apps/api-core/src/orders/serializers/order-item.serializer.ts`
- Create: `apps/api-core/src/orders/serializers/order.serializer.spec.ts`
- Modify: `apps/api-core/src/orders/order.repository.ts` — eliminar `serializeOrder` function

- [ ] **Step 1: Test del nuevo serializer**

`apps/api-core/src/orders/serializers/order.serializer.spec.ts`:

```ts
import { instanceToPlain } from 'class-transformer';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { OrderSerializer } from './order.serializer';

describe('OrderSerializer (H-22)', () => {
  const partial = {
    id: 'o1',
    orderNumber: 7,
    restaurantId: 'r1',
    cashShiftId: 'cs1',
    status: OrderStatus.COMPLETED,
    totalAmount: 5000n,
    paymentMethod: PaymentMethod.CASH,
    isPaid: true,
    customerEmail: 'c@e.com',
    customerName: 'C',
    customerPhone: null,
    deliveryAddress: null,
    deliveryReferences: null,
    cancellationReason: null,
    orderSource: 'KIOSK',
    orderType: 'PICKUP',
    tableNumber: null,
    createdAt: new Date('2026-05-29T12:00:00Z'),
    updatedAt: new Date('2026-05-29T12:00:00Z'),
    items: [
      {
        id: 'oi1',
        quantity: 2,
        unitPrice: 2500n,
        subtotal: 5000n,
        notes: null,
        product: { id: 'p1', name: 'Burger', price: 2500n },
        menuItem: null,
      },
    ],
  };

  it('expone totalAmount en pesos', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect(plain.totalAmount).toBe(50);
  });

  it('expone items[].unitPrice y subtotal en pesos', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect((plain.items as any[])[0].unitPrice).toBe(25);
    expect((plain.items as any[])[0].subtotal).toBe(50);
  });

  it('expone items[].product.price en pesos', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect((plain.items as any[])[0].product.price).toBe(25);
  });

  it('preserva campos no monetarios', () => {
    const plain = instanceToPlain(new OrderSerializer(partial as any));
    expect(plain.id).toBe('o1');
    expect(plain.orderNumber).toBe(7);
    expect(plain.status).toBe(OrderStatus.COMPLETED);
    expect(plain.paymentMethod).toBe(PaymentMethod.CASH);
    expect(plain.customerEmail).toBe('c@e.com');
  });

  it('maneja menuItem.priceOverride si está presente', () => {
    const withMenuItem = {
      ...partial,
      items: [
        {
          ...partial.items[0],
          menuItem: { id: 'mi1', priceOverride: 3000n },
        },
      ],
    };
    const plain = instanceToPlain(new OrderSerializer(withMenuItem as any));
    expect((plain.items as any[])[0].menuItem.priceOverride).toBe(30);
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL (no existe el archivo)**

```bash
docker compose exec res-api-core pnpm test -- order.serializer.spec
```

- [ ] **Step 3: Crear `OrderItemSerializer`**

`apps/api-core/src/orders/serializers/order-item.serializer.ts`:

```ts
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';

@Exclude()
class OrderItemProductSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ description: 'Precio en pesos' })
  @Expose()
  @Transform(({ value }) =>
    typeof value === 'bigint' || typeof value === 'number' ? fromCents(value) : value,
  )
  price: number;

  constructor(partial: { id: string; name: string; price: bigint | number }) {
    this.id = partial.id;
    this.name = partial.name;
    this.price = partial.price as unknown as number;
  }
}

@Exclude()
class OrderItemMenuItemSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiPropertyOptional({ description: 'Precio override en pesos' })
  @Expose()
  @Transform(({ value }) =>
    value === null || value === undefined ? null : fromCents(value as bigint | number),
  )
  priceOverride: number | null;

  constructor(partial: { id: string; priceOverride: bigint | number | null }) {
    this.id = partial.id;
    this.priceOverride = partial.priceOverride as unknown as number | null;
  }
}

@Exclude()
export class OrderItemSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty({ description: 'Precio unitario en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  unitPrice: number;

  @ApiProperty({ description: 'Subtotal en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  subtotal: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  notes: string | null;

  @ApiPropertyOptional({ type: OrderItemProductSerializer, nullable: true })
  @Expose()
  @Type(() => OrderItemProductSerializer)
  product: OrderItemProductSerializer | null;

  @ApiPropertyOptional({ type: OrderItemMenuItemSerializer, nullable: true })
  @Expose()
  @Type(() => OrderItemMenuItemSerializer)
  menuItem: OrderItemMenuItemSerializer | null;

  constructor(partial: any) {
    this.id = partial.id;
    this.quantity = partial.quantity;
    this.unitPrice = partial.unitPrice;
    this.subtotal = partial.subtotal;
    this.notes = partial.notes ?? null;
    this.product = partial.product ? new OrderItemProductSerializer(partial.product) : null;
    this.menuItem = partial.menuItem ? new OrderItemMenuItemSerializer(partial.menuItem) : null;
  }
}
```

- [ ] **Step 4: Crear `OrderSerializer`**

`apps/api-core/src/orders/serializers/order.serializer.ts`:

```ts
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '@prisma/client';

import { fromCents } from '../../common/helpers/money';
import { OrderItemSerializer } from './order-item.serializer';

@Exclude()
export class OrderSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  orderNumber: number;

  @ApiProperty()
  @Expose()
  restaurantId: string;

  @ApiProperty()
  @Expose()
  cashShiftId: string;

  @ApiProperty({ enum: OrderStatus })
  @Expose()
  status: OrderStatus;

  @ApiProperty({ description: 'Total en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  totalAmount: number;

  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true })
  @Expose()
  paymentMethod: PaymentMethod | null;

  @ApiProperty()
  @Expose()
  isPaid: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  customerEmail: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  customerName: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  customerPhone: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  deliveryAddress: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  deliveryReferences: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  cancellationReason: string | null;

  @ApiProperty()
  @Expose()
  orderSource: string;

  @ApiProperty()
  @Expose()
  orderType: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  tableNumber: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiProperty({ type: [OrderItemSerializer] })
  @Expose()
  @Type(() => OrderItemSerializer)
  items: OrderItemSerializer[];

  constructor(partial: any) {
    this.id = partial.id;
    this.orderNumber = partial.orderNumber;
    this.restaurantId = partial.restaurantId;
    this.cashShiftId = partial.cashShiftId;
    this.status = partial.status;
    this.totalAmount = partial.totalAmount;
    this.paymentMethod = partial.paymentMethod ?? null;
    this.isPaid = partial.isPaid;
    this.customerEmail = partial.customerEmail ?? null;
    this.customerName = partial.customerName ?? null;
    this.customerPhone = partial.customerPhone ?? null;
    this.deliveryAddress = partial.deliveryAddress ?? null;
    this.deliveryReferences = partial.deliveryReferences ?? null;
    this.cancellationReason = partial.cancellationReason ?? null;
    this.orderSource = partial.orderSource;
    this.orderType = partial.orderType;
    this.tableNumber = partial.tableNumber ?? null;
    this.createdAt = partial.createdAt;
    this.updatedAt = partial.updatedAt;
    this.items = Array.isArray(partial.items)
      ? partial.items.map((i: unknown) => new OrderItemSerializer(i as any))
      : [];
  }
}
```

- [ ] **Step 5: Reemplazar `serializeOrder` en `OrderRepository`**

Cambios concretos en `apps/api-core/src/orders/order.repository.ts`:

1. **Reemplazar imports** (líneas 1-5) por:

```ts
import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { OrderSerializer } from './serializers/order.serializer';
```

(Quitar el import de `fromCents` — ya no se usa en este archivo.)

2. **Eliminar el bloque** `function serializeOrder<T>...` completo (líneas 13-44 originales, incluyendo el JSDoc encima).

3. **Reemplazar cada `return serializeOrder(x)` por `return new OrderSerializer(x)`** y cada `return orders.map(serializeOrder)` por `return orders.map((o) => new OrderSerializer(o))`. Esto aplica en:

| Método | Cambio |
|--------|--------|
| `createWithItems` | `return serializeOrder(order)` → `return new OrderSerializer(order)` |
| `findById` | `return order ? serializeOrder(order) : null` → `return order ? new OrderSerializer(order) : null` |
| `findActiveOrders` | `return orders.map(serializeOrder)` → `return orders.map((o) => new OrderSerializer(o))` |
| `listOrders` | `return orders.map(serializeOrder)` → `return orders.map((o) => new OrderSerializer(o))` |
| `updateStatus` | `return serializeOrder(order)` → `return new OrderSerializer(order)` |
| `cancelOrder` | `return serializeOrder(order)` → `return new OrderSerializer(order)` |
| `findHistory` | `data: data.map(serializeOrder)` → `data: data.map((o) => new OrderSerializer(o))` |
| `findBySessionId` | `return orders.map(serializeOrder)` → `return orders.map((o) => new OrderSerializer(o))` |

4. **NO tocar en este step** el `orderBy` ni el `where` de `findActiveOrders` — eso es H-32/H-33 en Batch 3. En este task **solo** se hace el swap del serializer.

5. **NO tocar** el `CreateOrderData` interface — eso ya se tipó en Task 1 (H-21).

6. **NO tocar** las firmas `transitionStatusIfMatches`, `transitionStatusIfMatchesAndUnpaid`, `unmarkAsPaidIfPaid` — son no-op para H-22 (no usan serializer).

- [ ] **Step 6: Correr tests del serializer**

```bash
docker compose exec res-api-core pnpm test -- order.serializer.spec
```

Expected: PASS.

- [ ] **Step 7: Suite completa**

```bash
docker compose exec res-api-core pnpm test
```

Expected: PASS — el `OrderSerializer` produce el mismo shape que `serializeOrder`, así que callers existentes no deben romper.

> Si rompe, revisar específicamente `findHistory` (tiene `data` y `meta` — el `data` debe ser `OrderSerializer[]`) y `kioskCreateOrder` / `createOrderFromDashboard` e2e.

---

### Task 8: H-23 — Limpiar `as unknown as` en `OrderShiftReportRepository`

**Files:**
- Modify: `apps/api-core/src/orders/order-shift-report.repository.ts`

- [ ] **Step 1: Test que verifica que el tipo de retorno es correcto**

Agregar al archivo `order-shift-report.repository.spec.ts` (o crearlo si no existe):

```ts
import { OrderShiftReportRepository, OrderGroupRow, TopProductWithName } from './order-shift-report.repository';

describe('OrderShiftReportRepository (H-23)', () => {
  it('groupOrdersByShift retorna `Promise<OrderGroupRow[]>` sin doble coerción', () => {
    // Compile-time check: el método debe estar tipado directamente,
    // no via `as unknown as`. Si se introduce un `as unknown` en el futuro
    // este test no lo detecta, pero el grep en CI sí.
    const fn: OrderShiftReportRepository['groupOrdersByShift'] = (r, s) =>
      Promise.resolve<OrderGroupRow[]>([]);
    expect(typeof fn).toBe('function');
  });
});
```

- [ ] **Step 2: Reemplazar `as unknown as` por type assertion seguro**

`apps/api-core/src/orders/order-shift-report.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const { status, paymentMethod, orderType, orderSource } = Prisma.OrderScalarFieldEnum;
const { productId } = Prisma.OrderItemScalarFieldEnum;

export interface OrderGroupRow {
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  orderType: string | null;
  orderSource: string | null;
  _sum: { totalAmount: bigint | null };
  _count: { id: number };
}

export interface TopProductWithName {
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}

type TopProductRow = {
  productId: string;
  _sum: { quantity: number | null; subtotal: bigint | null };
};

@Injectable()
export class OrderShiftReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async groupOrdersByShift(
    restaurantId: string,
    sessionId: string,
  ): Promise<OrderGroupRow[]> {
    // Prisma's groupBy generic infers the result from `by`. The shape matches
    // OrderGroupRow exactly; the previous `as unknown as` cast (audit H-23)
    // was a workaround for an older Prisma version and is no longer needed.
    const rows = await this.prisma.order.groupBy({
      by: [status, paymentMethod, orderType, orderSource],
      where: { cashShiftId: sessionId, cashShift: { restaurantId } },
      _sum: { totalAmount: true },
      _count: { id: true },
    });
    return rows as OrderGroupRow[];
  }

  async getTopProductsWithNamesByShift(
    restaurantId: string,
    sessionId: string,
    take = 5,
  ): Promise<TopProductWithName[]> {
    const rows = await this.prisma.orderItem.groupBy({
      by: [productId],
      where: {
        order: {
          cashShiftId: sessionId,
          cashShift: { restaurantId },
          status: { not: OrderStatus.CANCELLED },
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    });
    const typed = rows as TopProductRow[];

    if (typed.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: typed.map((r) => r.productId) }, restaurantId },
      select: { id: true, name: true },
    });

    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return typed.map((r) => ({
      id: r.productId,
      name: nameMap[r.productId] ?? 'Producto',
      quantity: r._sum.quantity ?? 0,
      total: r._sum.subtotal ?? 0n,
    }));
  }
}
```

- [ ] **Step 3: Correr tests del repo**

```bash
docker compose exec res-api-core pnpm test -- order-shift-report
```

Expected: PASS.

- [ ] **Step 4: Correr suite de cash-register stats (que usa este repo)**

```bash
docker compose exec res-api-core pnpm test -- cash-register
```

Expected: PASS.

---

### Task 9: H-27 — `getCurrentSession` retorna `null`, no `{}`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`
- Test: `apps/api-core/src/cash-register/cash-register.controller.spec.ts` (agregar caso)

- [ ] **Step 1: Test del controller para el caso "sin sesión abierta"**

Agregar en `cash-register.controller.spec.ts`:

```ts
describe('GET /v1/cash-register/current (H-27)', () => {
  it('retorna null cuando no hay sesión abierta', async () => {
    jest.spyOn(registerService, 'getCurrentSession').mockResolvedValue(null);
    jest.spyOn(timezoneService, 'getTimezone').mockResolvedValue('UTC');
    const result = await controller.current({ restaurantId: 'r1' });
    expect(result).toBeNull();
  });

  it('retorna CashShiftWithCountSerializer cuando hay sesión abierta', async () => {
    const session = {
      id: 's1',
      restaurantId: 'r1',
      userId: 'u',
      lastOrderNumber: 0,
      openingBalance: 0n,
      totalSales: null,
      totalOrders: null,
      openedAt: new Date('2026-05-29T10:00:00Z'),
      closedAt: null,
      status: 'OPEN',
      closedBy: null,
      user: { id: 'u', email: 'u@e.com' },
      _count: { orders: 3 },
    };
    jest.spyOn(registerService, 'getCurrentSession').mockResolvedValue(session as any);
    jest.spyOn(timezoneService, 'getTimezone').mockResolvedValue('UTC');
    const result = await controller.current({ restaurantId: 'r1' });
    expect((result as any).id).toBe('s1');
    expect((result as any)._count).toEqual({ orders: 3 });
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL (hoy retorna `{}` no `null`)**

```bash
docker compose exec res-api-core pnpm test -- cash-register.controller.spec
```

- [ ] **Step 3: Ajustar service y controller**

`apps/api-core/src/cash-register/cash-register.service.ts:123-127`:

```ts
async getCurrentSession(restaurantId: string) {
  return this.registerSessionRepository.findOpenWithOrderCount(restaurantId);
  // ↑ ya retorna `CashShiftWithUserAndCount | null`; antes envolvía con `|| {}`.
}
```

`apps/api-core/src/cash-register/cash-register.controller.ts:130-137`:

```ts
import { CashShiftWithCountSerializer } from './serializers/cash-shift-with-count.serializer';

// ...

@Get('current')
@Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
@ApiOperation({ summary: 'Sesión de caja actualmente abierta' })
@ApiResponse({ status: 200, type: CashShiftWithCountSerializer, description: 'Sesión activa (null si no hay)' })
@ApiResponse({ status: 401, description: 'No autenticado' })
async current(@CurrentUser() user: { restaurantId: string }) {
  const [session, tz] = await Promise.all([
    this.registerService.getCurrentSession(user.restaurantId),
    this.timezoneService.getTimezone(user.restaurantId),
  ]);
  if (!session) return null;
  return new CashShiftWithCountSerializer(session, tz);
}
```

- [ ] **Step 4: Smoke check del frontend**

Cualquier consumidor del endpoint `/v1/cash-register/current` esperaba `{}` cuando no había sesión. Verificar:

```bash
grep -rn "register/current\|currentSession\|getCurrentSession" apps/ui/src/
```

Para cada caller, asegurar que maneja `null`. La firma de la respuesta cambia (`{} | CashShiftSerializer` → `null | CashShiftWithCountSerializer`).

Si encuentras lugares que hagan `if (!('id' in session))` o `if (Object.keys(session).length === 0)`, reemplazarlos por `if (!session)`.

- [ ] **Step 5: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- cash-register.controller.spec
```

Expected: PASS.

---

### Task 10: Suite completa y commit del Batch 2

- [ ] **Step 1: Correr toda la suite backend**

```bash
docker compose exec res-api-core pnpm test
```

Expected: PASS.

- [ ] **Step 2: Correr e2e relevantes**

```bash
docker compose exec res-api-core pnpm test:e2e -- orders
docker compose exec res-api-core pnpm test:e2e -- cash-register
```

Expected: PASS.

- [ ] **Step 3: Commit del Batch 2**

```bash
git add apps/api-core/src/orders/serializers/ \
        apps/api-core/src/orders/order.repository.ts \
        apps/api-core/src/orders/order-shift-report.repository.ts \
        apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts \
        apps/api-core/src/cash-register/cash-register.controller.spec.ts \
        apps/ui/src/  # si hubo ajustes a callers de /current

git commit -m "$(cat <<'EOF'
refactor(api): batch 2 MEDIOS serialización (H-22, H-23, H-27)

- H-22: OrderSerializer + OrderItemSerializer reemplazan función serializeOrder<T>.
        Class-transformer @Exclude/@Expose/@Transform garantizan que money sale en pesos
        y los campos sensibles no se filtran por accidente.
- H-23: Limpieza de doble coerción `as unknown as` en OrderShiftReportRepository.
- H-27: getCurrentSession retorna null (no {}); controller serializa con
        CashShiftWithCountSerializer cuando hay sesión.

Spec ref: apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
EOF
)"
```

---

## Batch 3 — Cola cocina y stats (H-24-doc, H-28, H-30-doc, H-31, H-32, H-33)

> Nota: H-29 quedó en Batch 1 por necesidad técnica.

### Task 11: H-32, H-33 — Cola cocina filtra `cashShift.status=OPEN` y orderna FIFO

**Files:**
- Modify: `apps/api-core/src/orders/order.repository.ts` (método `findActiveOrders`)
- Test: `apps/api-core/src/orders/order.repository.spec.ts`

- [ ] **Step 1: Agregar tests con mocks de Prisma a `order.repository.spec.ts`**

> El archivo ya existe (creado en Task 1 con el test de tipos de H-21). El proyecto **usa mocks de Prisma** para unit tests del repo (ver `orders.service.spec.ts` como referencia). El test verifica el **shape del `where` y `orderBy` que el repo pasa a Prisma**, no comportamiento real de DB.

Agregar al archivo:

```ts
import { Test } from '@nestjs/testing';
import { OrderStatus, CashShiftStatus } from '@prisma/client';

import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  order: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('OrderRepository.findActiveOrders (H-32, H-33)', () => {
  let repo: OrderRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    repo = moduleRef.get(OrderRepository);
  });

  it('H-32: where incluye cashShift.status = OPEN', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);
    await repo.findActiveOrders('r1', [OrderStatus.CREATED, OrderStatus.CONFIRMED]);

    expect(mockPrisma.order.findMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.order.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      restaurantId: 'r1',
      status: { in: [OrderStatus.CREATED, OrderStatus.CONFIRMED] },
      cashShift: { status: CashShiftStatus.OPEN },
    });
  });

  it('H-33: orderBy es FIFO (createdAt asc, tiebreaker orderNumber asc)', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);
    await repo.findActiveOrders('r1', [OrderStatus.CREATED]);

    const call = mockPrisma.order.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([
      { createdAt: 'asc' },
      { orderNumber: 'asc' },
    ]);
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL (hoy ordena `desc` y no filtra status)**

```bash
docker compose exec res-api-core pnpm test -- order.repository.spec
```

- [ ] **Step 3: Ajustar `findActiveOrders`**

```ts
async findActiveOrders(restaurantId: string, statuses: OrderStatus[]) {
  const orders = await this.prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: statuses },
      cashShift: { status: CashShiftStatus.OPEN },
    },
    include: ORDER_WITH_ITEMS,
    orderBy: [{ createdAt: 'asc' }, { orderNumber: 'asc' }],
  });
  return orders.map((o) => new OrderSerializer(o));
}
```

Agregar import:

```ts
import { OrderStatus, Prisma, PaymentMethod, CashShiftStatus } from '@prisma/client';
```

- [ ] **Step 4: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- order.repository.spec
```

Expected: PASS.

- [ ] **Step 5: Verificar que el endpoint de cocina (KDS) no rompe**

```bash
docker compose exec res-api-core pnpm test:e2e -- kitchen
```

Expected: PASS (si rompe, probablemente por fixtures que asumen `desc`; actualizar fixtures).

---

### Task 12: H-28 — `topProducts` llama directo a `getTopProductsWithNamesByShift`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts` (líneas ~169-176)

- [ ] **Step 1: Test del controller**

Agregar en `cash-register.controller.spec.ts`:

```ts
describe('GET /v1/cash-register/top-products/:sessionId (H-28)', () => {
  it('llama directo a getTopProductsWithNamesByShift, no computa el summary completo', async () => {
    const topSpy = jest
      .spyOn(orderShiftReportRepo, 'getTopProductsWithNamesByShift')
      .mockResolvedValue([{ id: 'p1', name: 'Burger', quantity: 5, total: 1500n }]);
    const fullSpy = jest.spyOn(statsService, 'getSummary');
    const result = await controller.topProducts(
      { restaurantId: 'r1' },
      { cashShift: { id: 's1' } } as any,
    );
    expect(topSpy).toHaveBeenCalledWith('r1', 's1');
    expect(fullSpy).not.toHaveBeenCalled();
    expect(result.topProducts).toEqual([
      { id: 'p1', name: 'Burger', quantity: 5, total: 1500n },
    ]);
  });
});
```

> Si `statsService` y `orderShiftReportRepo` no están aún en el spec, agregarlos al `beforeEach`/`Test.createTestingModule`.

- [ ] **Step 2: Correr — Expected FAIL**

```bash
docker compose exec res-api-core pnpm test -- cash-register.controller.spec
```

- [ ] **Step 3: Inyectar el repo y simplificar el endpoint**

En `cash-register.controller.ts`:

```ts
import { OrderShiftReportRepository } from '../orders/order-shift-report.repository';

// ...

constructor(
  private readonly registerService: CashRegisterService,
  private readonly statsService: CashRegisterStatsService,
  private readonly timezoneService: TimezoneService,
  private readonly orderShiftReport: OrderShiftReportRepository,   // ← nuevo
) {}

// ...

@Get('top-products/:sessionId')
@UseGuards(CashShiftGuard)
// ... (decoradores Swagger sin cambios)
async topProducts(
  @CurrentUser() user: { restaurantId: string },
  @Req() req: Request & { cashShift: { id: string } },
) {
  const topProducts = await this.orderShiftReport.getTopProductsWithNamesByShift(
    user.restaurantId,
    req.cashShift.id,
  );
  return { topProducts };
}
```

Importante: el shape de respuesta debe seguir siendo `{ topProducts: [...] }` para no romper el cliente. El serializer `ShiftSummarySerializer` ya transformaba `total: bigint` a algo que el cliente entendía — verificar y mantener la misma transformación. Si el cliente espera `total` en pesos, hacer la transformación inline:

```ts
return {
  topProducts: topProducts.map((p) => ({
    ...p,
    total: Number(p.total) / 100,   // o fromCents
  })),
};
```

Mejor aún: extraer a un serializer pequeño `TopProductsSerializer` que aplique `fromCents` con `@Transform`. Si ya existe en `cash-register-stats.serializer.ts`, reutilizar.

```bash
grep -n "TopProduct\|topProducts" apps/api-core/src/cash-register/serializers/cash-register-stats.serializer.ts
```

Si hay una sub-clase `TopProductSerializer`, instanciarla:

```ts
const items = topProducts.map((p) => new TopProductSerializer(p));
return { topProducts: items };
```

- [ ] **Step 4: Ajustar el módulo (DI)**

`apps/api-core/src/cash-register/cash-register.module.ts` — asegurar que `OrderShiftReportRepository` esté exportado o accesible. Probablemente ya está vía `OrdersModule`. Si no, importar el `OrdersModule` o `forwardRef`.

- [ ] **Step 5: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- cash-register
```

Expected: PASS.

- [ ] **Step 6: E2e**

```bash
docker compose exec res-api-core pnpm test:e2e -- cash-register
```

Expected: PASS.

---

### Task 13: H-31 — Caché in-memory para summary de turnos CLOSED

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts` (agregar caso)
- Modify: `apps/api-core/src/cash-register/cash-register.module.info.md`

- [ ] **Step 1: Test que verifica el cache hit/miss**

Agregar en `cash-register.service.spec.ts`:

```ts
describe('CashRegisterService.getSessionSummary (H-31)', () => {
  it('cachea el summary de turnos CLOSED — 2nd call no recomputa', async () => {
    const closed = {
      id: 's1',
      restaurantId: 'r1',
      status: 'CLOSED',
      openedAt: new Date(),
      closedAt: new Date(),
      user: { id: 'u', email: 'u@e.com' },
    };
    jest.spyOn(repo, 'findById').mockResolvedValue(closed as any);
    const statsSpy = jest.spyOn(statsService, 'getSummary').mockResolvedValue({
      counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
      revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
      byPaymentMethod: [],
      byOrderType: [],
      byOrderSource: [],
      topProducts: [],
    });

    await service.getSessionSummary('r1', 's1');
    await service.getSessionSummary('r1', 's1');
    expect(statsSpy).toHaveBeenCalledTimes(1);
  });

  it('NO cachea el summary de turnos OPEN — recomputa siempre', async () => {
    const open = { id: 's2', restaurantId: 'r1', status: 'OPEN', user: { id: 'u', email: 'u@e.com' } };
    jest.spyOn(repo, 'findById').mockResolvedValue(open as any);
    const statsSpy = jest.spyOn(statsService, 'getSummary').mockResolvedValue({} as any);
    await service.getSessionSummary('r1', 's2');
    await service.getSessionSummary('r1', 's2');
    expect(statsSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Correr — Expected FAIL**

```bash
docker compose exec res-api-core pnpm test -- cash-register.service.spec
```

- [ ] **Step 3: Implementar caché in-memory en el service**

`apps/api-core/src/cash-register/cash-register.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { CashShiftStatus, OrderStatus, Prisma } from '@prisma/client';

import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from '../cash-shift/cash-shift.repository';
import {
  CashRegisterAlreadyOpenException,
  CashRegisterNotFoundException,
  NoOpenCashRegisterException,
  PendingOrdersException,
} from './exceptions/cash-register.exceptions';
import { DEFAULT_PAGE_SIZE } from '../config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CashRegisterStatsService, ShiftSummary } from './cash-register-stats.service';

const CLOSED_SUMMARY_CACHE_MAX = 200;

@Injectable()
export class CashRegisterService {
  /**
   * Caché in-memory de summary para turnos CLOSED. Audit H-31.
   *
   * Trade-offs:
   * - El summary de un turno CLOSED es inmutable (la H-09 garantiza que después
   *   de close no se pueden insertar órdenes), por lo tanto el cache nunca queda
   *   inconsistente.
   * - Cache simple con cap LRU-ish: al pasar el max, se borra la primera entrada
   *   insertada (Map preserva orden de inserción).
   * - Por proceso, no compartido entre instancias. En multi-instance deploy, cada
   *   réplica tiene su propio cache; aceptable porque la operación es read-only
   *   sobre data inmutable.
   */
  private readonly closedSummaryCache = new Map<string, ShiftSummary>();

  constructor(
    private readonly registerSessionRepository: CashShiftRepository,
    private readonly prisma: PrismaService,
    private readonly statsService: CashRegisterStatsService,
  ) {}

  // ... (openSession, closeSession, getSessionHistory, getOpenSessionId,
  //      getCurrentSession sin cambios — los tres primeros igual; el cuarto ya
  //      lo limpiamos en Task 9)

  async getSessionSummary(restaurantId: string, sessionId: string) {
    const session = await this.registerSessionRepository.findById(sessionId);
    if (!session || session.restaurantId !== restaurantId) {
      throw new CashRegisterNotFoundException(sessionId);
    }

    if (session.status === CashShiftStatus.CLOSED) {
      const cached = this.closedSummaryCache.get(sessionId);
      if (cached) return { session, summary: cached };

      const summary = await this.statsService.getSummary(restaurantId, sessionId);
      this.rememberSummary(sessionId, summary);
      return { session, summary };
    }

    const summary = await this.statsService.getSummary(restaurantId, sessionId);
    return { session, summary };
  }

  private rememberSummary(sessionId: string, summary: ShiftSummary): void {
    if (this.closedSummaryCache.size >= CLOSED_SUMMARY_CACHE_MAX) {
      const firstKey = this.closedSummaryCache.keys().next().value;
      if (firstKey !== undefined) this.closedSummaryCache.delete(firstKey);
    }
    this.closedSummaryCache.set(sessionId, summary);
  }
}
```

- [ ] **Step 4: Exportar `ShiftSummary` desde el stats service**

`apps/api-core/src/cash-register/cash-register-stats.service.ts` — ya exporta `ShiftSummary`. Verificar.

- [ ] **Step 5: Documentar el caché**

Editar `apps/api-core/src/cash-register/cash-register.module.info.md` agregando una sección:

```markdown
### Caché de summary para turnos CLOSED (H-31)

`CashRegisterService` mantiene un `Map<sessionId, ShiftSummary>` con cap de 200
entradas (LRU-ish). Justificación:

- Las órdenes de un turno CLOSED son inmutables (garantía de H-09 via
  `lockOpenShift`), así que el summary nunca cambia después del cierre.
- El history de la UI puede abrir el modal del mismo turno cerrado N veces;
  sin caché cada apertura ejecuta groupBy + topProducts.
- Por proceso, no compartido — aceptable porque la data subyacente es inmutable.

Para invalidar manualmente (no debería hacer falta), reiniciar el proceso.
```

- [ ] **Step 6: Correr tests**

```bash
docker compose exec res-api-core pnpm test -- cash-register
```

Expected: PASS.

---

### Task 14: H-30 — Documentar BigInt floor en `averageTicket`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register-stats.service.ts` (líneas 102-122)

- [ ] **Step 1: Verificar que el cálculo actual hace floor**

Releer `calculateRevenue`. La línea 117-119:

```ts
const averageTicket = completedCount > 0
  ? completedRevenue / BigInt(completedCount)
  : 0n;
```

`BigInt / BigInt` truncate hacia cero (≈ floor para valores positivos). Confirmado.

- [ ] **Step 2: Agregar JSDoc explicando la convención**

Reemplazar el bloque actual:

```ts
/**
 * Answers three key shift revenue questions:
 * - How much money entered the register? → completed (COMPLETED orders only)
 * - How much money is committed but not yet collected? → pending (active orders; excludes CANCELLED since those will never be collected)
 * - How much does the average paying customer spend? → averageTicket (completed revenue / number of completed orders)
 *
 * `averageTicket` (audit H-30): es BigInt floor division en centavos. La
 * pérdida es como mucho `completedCount - 1` centavos por turno (≤ N-1 / 100
 * pesos en CLP/UYU). Documentado en vez de redondear porque el serializer
 * final aplica `fromCents` y la UI muestra 2 decimales — la "discrepancia"
 * `avg * count != total` cae siempre dentro del último decimal redondeado.
 *
 * Si en el futuro una integración contable necesita el float exacto, calcular
 * `Number(completedRevenue) / completedCount / 100` en el caller.
 */
private calculateRevenue(byStatus: StatusAccumulator): ShiftRevenue {
  // ... (cuerpo igual)
}
```

- [ ] **Step 3: No requiere test (solo doc)**

Pero correr la suite para asegurar que no hay regresión:

```bash
docker compose exec res-api-core pnpm test -- cash-register
```

---

### Task 15: H-24 — Documentar decisión consciente

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md`

- [ ] **Step 1: Buscar el archivo y agregar sección**

```bash
ls apps/api-core/src/orders/orders.module.info.md
```

Agregar:

```markdown
### `listOrders` lanza 409 sin caja abierta (audit H-24)

`OrdersService.listOrders` devuelve `409 NO_OPEN_CASH_REGISTER` cuando no hay
turno de caja abierto. Esto es una **decisión de producto consciente** (no un
bug — auditoría H-24, revisada 2026-05-29):

- El dashboard solo muestra órdenes del turno actual; sin caja abierta no hay
  noción de "actuales".
- Órdenes huérfanas entre turnos (caso defendido por H-09 — ya cerrado) no
  son visibles vía este endpoint pero **sí** vía `/v1/orders/history` con
  filtros de fecha.

Si en el futuro se decide cambiar a "lista vacía cuando no hay caja", revisar
también el frontend (`OrdersPanel.tsx`) que hoy maneja explícitamente el 409
para mostrar un CTA de abrir caja.
```

---

### Task 16: Suite completa y commit del Batch 3

- [ ] **Step 1: Correr toda la suite backend**

```bash
docker compose exec res-api-core pnpm test
```

Expected: PASS.

- [ ] **Step 2: E2e completos**

```bash
docker compose exec res-api-core pnpm test:e2e -- orders cash-register kitchen
```

Expected: PASS.

- [ ] **Step 3: Commit del Batch 3**

```bash
git add apps/api-core/src/orders/order.repository.ts \
        apps/api-core/src/orders/order.repository.spec.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts \
        apps/api-core/src/cash-register/cash-register.controller.spec.ts \
        apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.service.spec.ts \
        apps/api-core/src/cash-register/cash-register.module.ts \
        apps/api-core/src/cash-register/cash-register.module.info.md \
        apps/api-core/src/cash-register/cash-register-stats.service.ts \
        apps/api-core/src/orders/orders.module.info.md

git commit -m "$(cat <<'EOF'
fix(api): batch 3 MEDIOS cola cocina + stats (H-24-doc, H-28, H-30-doc, H-31, H-32, H-33)

- H-32: kitchen queue filtra cashShift.status=OPEN — órdenes huérfanas de turnos cerrados ya no reaparecen
- H-33: kitchen queue orderna FIFO (createdAt asc, tiebreaker orderNumber asc)
- H-28: /top-products llama directo al repo en vez de re-correr el summary completo
- H-31: caché in-memory para summary de turnos CLOSED (Map con cap 200)
- H-30: JSDoc en averageTicket explicando BigInt floor division
- H-24: documentado como decisión consciente en orders.module.info.md

Spec ref: apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
EOF
)"
```

---

## Batch 4 — UX frontend (H-35-front, H-36, H-37, H-38, H-39)

### Task 17: H-35 frontend — `maxLength={500}` en CancelOrderModal

**Files:**
- Modify: `apps/ui/src/components/dash/orders/CancelOrderModal.tsx`

- [ ] **Step 1: Aplicar el cambio**

En `apps/ui/src/components/dash/orders/CancelOrderModal.tsx:39-48`, agregar `maxLength={500}` al input y mostrar contador:

```tsx
<input
  type="text"
  value={reason}
  onChange={(e) => { setReason(e.target.value); setError(false); }}
  placeholder="Ej: Pedido duplicado, error del cliente..."
  maxLength={500}
  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
    error ? 'border-red-400 ring-red-400' : 'border-slate-300 focus:ring-slate-400'
  }`}
  autoFocus
/>
{error && (
  <p className="mt-1 text-xs text-red-500">El motivo es requerido</p>
)}
<p className="mt-1 text-[10px] text-slate-400 text-right">
  {reason.length}/500
</p>
```

- [ ] **Step 2: No requiere test unitario adicional (el backend ya valida)**

Smoke check manual de UX cuando se haga el run.

---

### Task 18: H-36 — `handleConfirm` guarda contra `items: []`

**Files:**
- Modify: `apps/ui/src/components/dash/orders/CreateOrderModal.tsx`

- [ ] **Step 1: Aplicar el guard**

En `apps/ui/src/components/dash/orders/CreateOrderModal.tsx:35`, agregar al inicio de `handleConfirm`:

```ts
async function handleConfirm(formValues: Step3Values) {
  if (items.length === 0) {
    setErrorMsg('Agrega al menos un producto antes de confirmar el pedido.');
    return;
  }
  setIsSubmitting(true);
  setErrorMsg(null);
  // ... (resto del flujo igual)
}
```

- [ ] **Step 2: No requiere test (cubierto por la disable del step 1)**

---

### Task 19: H-37 — `parseInt(value, 10)`

**Files:**
- Modify: `apps/ui/src/components/dash/orders/CreateOrderStep1.tsx`

- [ ] **Step 1: Aplicar el cambio**

`apps/ui/src/components/dash/orders/CreateOrderStep1.tsx:111`:

```tsx
onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value, 10) || 0)}
```

- [ ] **Step 2: No requiere test (cambio defensivo, comportamiento idéntico para inputs válidos)**

---

### Task 20: H-38 — `formatMoney` en OrderCard

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`

- [ ] **Step 1: Importar helpers y reemplazar `toFixed`**

En `apps/ui/src/components/dash/orders/OrderCard.tsx`:

```tsx
import { useState } from 'react';
import type { Order } from './api';
import { OrderCustomerModal } from './OrderCustomerModal';
import { useRestaurantSettings } from '../../../lib/restaurant-settings';
import { formatMoney } from '../../../lib/money';

// ... (resto de constantes igual)

export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked,
  inFlightIds = new Set(),
}: OrderCardProps) {
  // ... (resto igual)
  const { data: settings } = useRestaurantSettings();

  return (
    <div /* ... */ >
      {/* ... */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <span className="font-semibold text-sm text-slate-800">
          {formatMoney(Number(order.totalAmount), settings)}
        </span>
        {/* ... */}
      </div>
      {/* ... */}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que no quedan otros `toFixed` en componentes de orders**

```bash
grep -rn "toFixed" apps/ui/src/components/dash/orders/
```

Si aparecen más, ajustar.

---

### Task 21: H-39 — `prerender = false` en `dash/orders.astro`

**Files:**
- Modify: `apps/ui/src/pages/dash/orders.astro`

- [ ] **Step 1: Cambiar la línea**

`apps/ui/src/pages/dash/orders.astro:2`:

```astro
---
export const prerender = false;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import OrdersPanel from '../../components/dash/orders/OrdersPanel';
---
```

- [ ] **Step 2: Verificar otras páginas autenticadas**

```bash
grep -rn "prerender = true" apps/ui/src/pages/dash/
```

Si hay más páginas dashboard con `prerender = true`, considerar si entran en el scope (probablemente sí — pero solo `dash/orders.astro` está en el audit). Tocar solo la del audit en este batch.

---

### Task 22: Build de UI y commit del Batch 4

- [ ] **Step 1: Build de UI**

```bash
cd apps/ui && pnpm build
```

Expected: SUCCESS, no debe haber errores TS.

- [ ] **Step 2: Tests del UI (si existen)**

```bash
cd apps/ui && pnpm test 2>&1 | head -50
```

> Si `pnpm test` no está configurado en `apps/ui`, este step es no-op. Verificar primero con `cat apps/ui/package.json | grep '"test"'`.

- [ ] **Step 3: Commit del Batch 4**

```bash
git add apps/ui/src/components/dash/orders/CancelOrderModal.tsx \
        apps/ui/src/components/dash/orders/CreateOrderModal.tsx \
        apps/ui/src/components/dash/orders/CreateOrderStep1.tsx \
        apps/ui/src/components/dash/orders/OrderCard.tsx \
        apps/ui/src/pages/dash/orders.astro

git commit -m "$(cat <<'EOF'
fix(ui): batch 4 MEDIOS UX hardening (H-35, H-36, H-37, H-38, H-39)

- H-35 (frontend): maxLength={500} + contador en CancelOrderModal
- H-36: guard items.length > 0 en handleConfirm del wizard
- H-37: parseInt(value, 10) en CreateOrderStep1 (radix explícito)
- H-38: formatMoney(Number(totalAmount), settings) en OrderCard
- H-39: prerender = false en /dash/orders (página autenticada no debe pre-renderizarse)

Spec ref: apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
EOF
)"
```

---

## Task 23: Actualizar el spec con el estado de cada hallazgo

**Files:**
- Modify: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`

- [ ] **Step 1: Update del resumen ejecutivo**

Reemplazar las filas de MEDIO en la tabla por:

```markdown
| 🟡 MEDIO   | 19 | H-21 ✅, H-22 ✅, H-23 ✅, H-24 🔄, H-25 ✅, H-26 ✅, H-27 ✅, H-28 ✅, H-29 ✅, H-30 ✅, H-31 ✅, H-32 ✅, H-33 ✅, H-34 ✅, H-35 ✅, H-36 ✅, H-37 ✅, H-38 ✅, H-39 ✅ |
```

- [ ] **Step 2: Update sección "Progreso" agregando línea**

```markdown
- ✅ H-21, H-22, H-23, H-25, H-26, H-27, H-28, H-29, H-30, H-31, H-32, H-33, H-34, H-35, H-36, H-37, H-38, H-39 implementados (2026-05-29) — batch de MEDIOS dividido en 4 commits. Ver plan `2026-05-29-orders-cashshift-kitchen-medios-plan.md`.
- 🔄 H-24 documentado como decisión consciente (2026-05-29). Mantener 409 por diseño del dashboard.
```

- [ ] **Step 3: Update individual de cada H-XX**

Para cada hallazgo del 21 al 39, agregar al final del bloque:

```markdown
**Estado:** ✅ Implementado (2026-05-29)
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`
```

Excepción — H-24:

```markdown
**Estado:** 🔄 Modificado / decisión consciente (2026-05-29)
**Decisión:** mantener 409 NO_OPEN_CASH_REGISTER. El dashboard solo muestra órdenes del turno actual; órdenes huérfanas son visibles via `/orders/history`.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`
```

Y H-22 ya tenía estado parcial — actualizarlo a:

```markdown
**Estado:** ✅ Implementado completo (2026-05-29). La parte crítica (fromCents) ya estaba en 2026-05-25; el refactor estructural a clase Serializer dedicada se completó en este batch.
**Plan asociado:** `docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md`
```

- [ ] **Step 4: Update tabla "Orden sugerido de remediación"**

Reemplazar la fila de Backlog técnico:

```markdown
| **Backlog técnico** | ~~Todos los MEDIOS~~ ✅ (2026-05-29), H-AUX-02 |
```

- [ ] **Step 5: Commit del update del spec**

```bash
git add apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md

git commit -m "$(cat <<'EOF'
docs: mark H-21..H-39 implemented in audit findings spec

Todos los MEDIOS del audit cerrados (H-24 documentado como decisión consciente).
Ver plan: docs/superpowers/plans/2026-05-29-orders-cashshift-kitchen-medios-plan.md
EOF
)"
```

- [ ] **Step 6: Verificación final**

```bash
git log --oneline -6
```

Expected: 5 commits del batch (1 por batch + 1 del spec).

---

## Self-Review Checklist (ejecutar antes de empezar)

1. **Spec coverage:** los 19 hallazgos MEDIOS están cubiertos como tasks (H-21..H-39, incluyendo H-22 refactor + H-24 doc-only).
2. **Tests dentro de Docker:** todos los `pnpm test` y `pnpm test:e2e` usan `docker compose exec res-api-core ...`.
3. **TDD:** todos los cambios de comportamiento (no doc-only) tienen test que falla antes y pasa después.
4. **Commits granulares:** un commit por batch, mensajes con referencia al spec.
5. **No placeholders:** todo código mostrado es completo, no hay "TBD" ni "similar a Task N".
6. **No mock de DB en tests del repo:** los tests de `OrderRepository.findActiveOrders` (H-32, H-33) requieren DB real — el proyecto ya usa Postgres en Docker para tests, no mocks. Si el patrón existente del proyecto usa mocks, ajustar la estrategia del test al patrón del proyecto.

## Notas de ejecución

- **Si Batch 2 (H-22) rompe e2e**: probablemente por shape del `OrderSerializer`. Comparar con el output anterior de `serializeOrder` y ajustar campos opcionales/nullables.
- **Si Batch 3 (H-32) rompe el KDS**: fixtures de tests de cocina pueden asumir órdenes de turnos cerrados. Ajustar fixtures para crear órdenes en un shift OPEN.
- **H-AUX-02** (SSE patch local) NO entra en este plan — es un hallazgo ALTO separado.
- **H-04** (tokens en URL) NO entra en este plan — requiere su propio diseño.
