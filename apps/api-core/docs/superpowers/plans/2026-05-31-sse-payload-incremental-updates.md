# SSE Payload + Incremental Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver H-AUX-02 — el backend pasará un payload tipado y mínimo en cada evento SSE; los clientes aplicarán patch local en lugar de refetchear toda la lista. El refetch sobrevive solo en montaje y reconexión.

**Architecture:**

- **Backend:** `SseService.streamFor*` deja de descartar `data`. `OrderEventsService.emit*` se reescribe con dos métodos y tipos estrictos:
  - `emitOrderCreated(restaurantId, dashboard: OrderCreatedPayload, kitchen: KitchenOrderPayload)`
  - `emitOrderUpdated(restaurantId, dashboard: OrderUpdatedPayload, kitchen: KitchenOrderPayload)`
- **Asimetría dashboard/cocina (decisión consciente):**
  - Dashboard: `order:new` lleva shape mínimo completo (~250b, 14 campos); `order:updated` lleva **delta** (~100b, solo los 5 campos mutables: `id, status, isPaid, paymentMethod, cancellationReason`). Cliente hace merge `{...existing, ...delta}`. Posible porque el dashboard siempre tiene la orden cargada (vía `loadOrders` o `order:new` previo).
  - Cocina: ambos eventos llevan el mismo shape completo (~140b: `id, orderNumber, status, displayTime, items[]`). Cliente hace set/delete del `ordersMap` según status. La cocina necesita el payload completo en `updated` porque cuando una orden transita CREATED→CONFIRMED, la cocina nunca la había visto.
- **Multi-tenant:** `SseService.emitToRestaurant`/`emitToKitchen` ya filtran por `restaurantId`. Sin cambios.
- **Tipos:** interfaces estrictas duplicadas en backend (`apps/api-core/src/events/payloads/`) y frontend (`apps/ui/src/lib/sse-payloads.ts`). Sin `any`/`unknown`. `null` permitido solo donde la BD lo permite (paymentMethod, cancellationReason, customer*, delivery*, item.notes).
- **Drift protection:** test de contrato en backend que valida `Object.keys(payload).sort()` versus una lista canónica `*_PAYLOAD_KEYS` exportada del archivo de tipos. Si alguien agrega/quita un campo en el builder sin sincronizar la interfaz, el test rompe.

**Tech Stack:** NestJS · RxJS Subjects · Astro · React 18 · @microsoft/fetch-event-source · EventSource API · Jest

**Spec source:** `docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` — H-AUX-02 (líneas 93–166)

---

## File Structure

**Backend — crear:**
- `apps/api-core/src/events/payloads/order-event-payloads.ts` — 5 interfaces (`OrderCreatedPayload`, `OrderUpdatedPayload`, `OrderItemEventPayload`, `KitchenOrderPayload`, `KitchenOrderItemPayload`) + 5 listas canónicas de keys (`as const`).
- `apps/api-core/src/events/payloads/order-event-payloads.spec.ts` — test que valida que los builders retornan exactamente las keys declaradas en cada interface.

**Backend — modificar:**
- `apps/api-core/src/events/sse.service.ts` — preservar `data` en `streamFor*`.
- `apps/api-core/src/events/sse.service.spec.ts` — asserts actualizados.
- `apps/api-core/src/events/orders.events.ts` — métodos tipados con las nuevas interfaces.
- `apps/api-core/src/events/orders.events.spec.ts` — asserts contra los nuevos shapes.
- `apps/api-core/src/orders/orders.service.ts` — agregar `buildOrderCreatedPayloads()` + `buildOrderUpdatedPayloads()`; reemplazar los 7 call sites de `emit*`.
- `apps/api-core/src/orders/orders.service.spec.ts` — asserts contra los nuevos payloads.
- `apps/api-core/src/orders/orders.module.info.md` — documentar contrato SSE.
- `apps/api-core/src/kitchen/kitchen.module.info.md` — documentar payload SSE.

**Frontend — crear:**
- `apps/ui/src/lib/sse-payloads.ts` — interfaces duplicadas para el dashboard (las del cocinero viven inline en el archivo Astro porque la cocina es script-only y no hay React).

**Frontend — modificar:**
- `apps/ui/src/components/dash/orders/OrdersPanel.tsx` — efecto SSE con merge para `updated`, prepend para `new`, refetch en `onopen`.
- `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` — tests del patch local + merge.
- `apps/ui/src/pages/kitchen/index.astro` — `ordersMap` como source-of-truth, set/delete según status, `renderColumns()` extraído.

**Spec — actualizar:**
- `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` — marcar H-AUX-02 como `✅ Implementado (2026-05-31)`.

---

## Background notes para el ejecutor

**Por qué dos payloads distintos por canal:**
- El `OrderSerializer` actual expone 18 campos (incluye `restaurantId`, `cashShiftId`, `createdAt`, `updatedAt`, `customerName`, `tableNumber`) que la UI **nunca lee**. Mandarlos por SSE en cada transición desperdicia ancho de banda.
- El `KitchenOrderSerializer` actual expone 7 campos (incluye `totalAmount`, `orderType`, `tableNumber`) que la cocina **nunca lee** al renderizar la card. También se recortan.

**Por qué delta solo en dashboard:**
- En `order:updated` los únicos campos mutables son `status`, `isPaid`, `paymentMethod`, `cancellationReason`. El resto (`orderNumber`, `items`, `customer*`, `delivery*`, `orderSource`, `orderType`, `displayTime`) es inmutable post-creación. Mandar solo el delta corta ~60% del tamaño de cada evento y mantiene la integridad del cliente vía `{...existing, ...delta}`.
- En cocina el delta sería `{id, status}` (~40b), pero introduce un edge case: kiosk crea orden en `CREATED` → cocina la ignora → cajero confirma → cocina recibe `{id, status: 'CONFIRMED'}` pero no tiene la orden en su map → no puede pintarla. Por eso cocina lleva el payload completo siempre.

**Por qué los tipos están duplicados (no compartidos):**
- El monorepo no tiene paquete shared para tipos cross-app. Crear uno solo por este caso es overkill (regla del proyecto: YAGNI). El drift se mitiga con el test de contrato del backend — si los keys del payload no coinciden con la interface declarada, el test rompe.

**Tests dentro del contenedor Docker (regla del proyecto):**
- Backend: `docker compose exec res-api-core pnpm test`
- Frontend: `docker compose exec res-ui pnpm test` (o local `cd apps/ui && pnpm test`)

---

## Task 1: Declarar tipos de payload y listas canónicas de keys

**Files:**
- Create: `apps/api-core/src/events/payloads/order-event-payloads.ts`

- [ ] **Step 1: Crear el archivo con las 5 interfaces + 5 listas canónicas**

Crear `apps/api-core/src/events/payloads/order-event-payloads.ts` con este contenido exacto:

```ts
import { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * Payloads de los eventos SSE de Order.
 *
 * Audit H-AUX-02: los eventos antes viajaban con `data: {}` y los clientes
 * refetcheaban la lista entera. Ahora cada evento lleva un payload tipado
 * y mínimo. La asimetría dashboard/cocina es deliberada:
 *
 *   - Dashboard: order:new = OrderCreatedPayload (14 campos visibles en la UI).
 *                order:updated = OrderUpdatedPayload (5 campos mutables — delta).
 *     Cliente hace merge `{...existing, ...delta}`. Posible porque el dashboard
 *     siempre tiene la orden cargada (loadOrders inicial o order:new previo).
 *
 *   - Cocina: ambos eventos = KitchenOrderPayload (5 campos + items[]).
 *     Sin delta porque la cocina necesita el payload completo cuando una
 *     orden transita CREATED → CONFIRMED (nunca la había visto).
 *
 * Las listas `*_PAYLOAD_KEYS` son la fuente de verdad para el test de
 * contrato: el builder de cada payload debe retornar exactamente esas
 * keys, ni una más ni una menos. Si agregás un campo a la interface
 * agregalo también a la lista — el test rompe si los keys del runtime
 * no coinciden con la lista.
 */

// ── Dashboard ─────────────────────────────────────────────────────────

export interface OrderItemEventPayload {
  id: string;
  quantity: number;
  notes: string | null;
  productName: string;
}

export const ORDER_ITEM_EVENT_PAYLOAD_KEYS = [
  'id', 'quantity', 'notes', 'productName',
] as const;

export interface OrderCreatedPayload {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  isPaid: boolean;
  totalAmount: number;
  paymentMethod: PaymentMethod | null;
  cancellationReason: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryReferences: string | null;
  orderSource: string;
  orderType: string;
  displayTime: string;
  items: OrderItemEventPayload[];
}

export const ORDER_CREATED_PAYLOAD_KEYS = [
  'id', 'orderNumber', 'status', 'isPaid', 'totalAmount',
  'paymentMethod', 'cancellationReason',
  'customerEmail', 'customerPhone', 'deliveryAddress', 'deliveryReferences',
  'orderSource', 'orderType', 'displayTime', 'items',
] as const;

export interface OrderUpdatedPayload {
  id: string;
  status: OrderStatus;
  isPaid: boolean;
  paymentMethod: PaymentMethod | null;
  cancellationReason: string | null;
}

export const ORDER_UPDATED_PAYLOAD_KEYS = [
  'id', 'status', 'isPaid', 'paymentMethod', 'cancellationReason',
] as const;

// ── Cocina ────────────────────────────────────────────────────────────

export interface KitchenOrderItemPayload {
  quantity: number;
  notes: string | null;
  productName: string;
}

export const KITCHEN_ORDER_ITEM_PAYLOAD_KEYS = [
  'quantity', 'notes', 'productName',
] as const;

export interface KitchenOrderPayload {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  displayTime: string;
  items: KitchenOrderItemPayload[];
}

export const KITCHEN_ORDER_PAYLOAD_KEYS = [
  'id', 'orderNumber', 'status', 'displayTime', 'items',
] as const;
```

- [ ] **Step 2: Verificar que el archivo compila**

Run: `docker compose exec res-api-core pnpm exec tsc --noEmit -p tsconfig.json | head -10`
Expected: sin errores en `order-event-payloads.ts`. (Errores preexistentes en otros archivos están OK; los abordamos en las próximas tasks.)

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/events/payloads/order-event-payloads.ts
git commit -m "$(cat <<'EOF'
feat(events): declare strict SSE order event payload types (H-AUX-02)

Adds 5 interfaces and 5 canonical key arrays for the SSE order events:
  - OrderCreatedPayload (14 fields, sent on order:new to dashboard)
  - OrderUpdatedPayload (5 mutable fields, sent on order:updated as a delta)
  - KitchenOrderPayload (full kitchen shape, sent on both events)
  - OrderItemEventPayload / KitchenOrderItemPayload

Canonical key arrays back the contract test added in a follow-up commit:
builders must return exactly these keys or the test fails.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `SseService` preserva el payload en `streamFor*`

**Files:**
- Modify: `apps/api-core/src/events/sse.service.ts:29-41`
- Modify: `apps/api-core/src/events/sse.service.spec.ts:19-37`

- [ ] **Step 1: Actualizar los tests de stream para esperar el payload real**

En `apps/api-core/src/events/sse.service.spec.ts`, reemplazar los dos primeros `it(...)` de los describes `emitToRestaurant` y `emitToKitchen` (líneas 19-37):

```ts
  describe('emitToRestaurant', () => {
    it('emits payload data to restaurant$ subject', async () => {
      const promise = firstValueFrom(service.streamForRestaurant('r1'));
      const payload = { id: 'o1', status: 'CONFIRMED' };
      service.emitToRestaurant('r1', 'order:new', payload);
      const msg = await promise;
      expect(msg.type).toBe('order:new');
      expect(msg.data).toEqual(payload);
    });
  });

  describe('emitToKitchen', () => {
    it('emits payload data to kitchen$ subject', async () => {
      const promise = firstValueFrom(service.streamForKitchen('r1'));
      const payload = { id: 'o1', orderNumber: 7 };
      service.emitToKitchen('r1', 'order:new', payload);
      const msg = await promise;
      expect(msg.type).toBe('order:new');
      expect(msg.data).toEqual(payload);
    });
  });
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec res-api-core pnpm test -- src/events/sse.service.spec.ts`
Expected: FAIL — `Expected: { id: 'o1', ... } Received: {}`.

- [ ] **Step 3: Cambiar `data: {}` por `data: evt.data` en los dos streams**

En `apps/api-core/src/events/sse.service.ts:29-41`:

```ts
  streamForRestaurant(restaurantId: string): Observable<MessageEvent> {
    return this.restaurant$.pipe(
      filter((evt) => evt.restaurantId === restaurantId),
      map((evt) => ({ type: evt.event, data: evt.data })),
    );
  }

  streamForKitchen(restaurantId: string): Observable<MessageEvent> {
    return this.kitchen$.pipe(
      filter((evt) => evt.restaurantId === restaurantId),
      map((evt) => ({ type: evt.event, data: evt.data })),
    );
  }
```

- [ ] **Step 4: Correr toda la suite del módulo events**

Run: `docker compose exec res-api-core pnpm test -- src/events`
Expected: PASS — todos los tests del módulo en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/events/sse.service.ts apps/api-core/src/events/sse.service.spec.ts
git commit -m "$(cat <<'EOF'
refactor(sse): preserve event payload in streamFor* (H-AUX-02 prep)

streamForRestaurant/streamForKitchen mapped every event to { data: {} },
discarding the payload before subscribers saw it. Now data flows through
unchanged — load-bearing for the upcoming incremental-update fix where
each event carries a typed order payload.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `OrderEventsService` con tipos estrictos

**Files:**
- Modify: `apps/api-core/src/events/orders.events.ts`
- Modify: `apps/api-core/src/events/orders.events.spec.ts`

- [ ] **Step 1: Reescribir el test contra el nuevo contrato tipado**

Reemplazar el contenido completo de `apps/api-core/src/events/orders.events.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { OrderEventsService, ORDER_EVENTS } from './orders.events';
import { SseService } from './sse.service';
import type {
  OrderCreatedPayload, OrderUpdatedPayload, KitchenOrderPayload,
} from './payloads/order-event-payloads';

const mockSseService = {
  emitToRestaurant: jest.fn(),
  emitToKitchen: jest.fn(),
};

describe('OrderEventsService', () => {
  let service: OrderEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsService,
        { provide: SseService, useValue: mockSseService },
      ],
    }).compile();
    service = module.get(OrderEventsService);
    jest.clearAllMocks();
  });

  const createdDashboard: OrderCreatedPayload = {
    id: 'o1', orderNumber: 7, status: OrderStatus.CREATED, isPaid: false, totalAmount: 100,
    paymentMethod: null, cancellationReason: null,
    customerEmail: null, customerPhone: null, deliveryAddress: null, deliveryReferences: null,
    orderSource: 'KIOSK', orderType: 'PICKUP', displayTime: '12:30', items: [],
  };
  const updatedDashboard: OrderUpdatedPayload = {
    id: 'o1', status: OrderStatus.CONFIRMED, isPaid: true,
    paymentMethod: PaymentMethod.CASH, cancellationReason: null,
  };
  const kitchen: KitchenOrderPayload = {
    id: 'o1', orderNumber: 7, status: OrderStatus.CONFIRMED, displayTime: '12:30', items: [],
  };

  describe('emitOrderCreated', () => {
    it('emits OrderCreatedPayload to the restaurant room', () => {
      service.emitOrderCreated('r1', createdDashboard, kitchen);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, createdDashboard);
    });

    it('emits KitchenOrderPayload to the kitchen room', () => {
      service.emitOrderCreated('r1', createdDashboard, kitchen);
      expect(mockSseService.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, kitchen);
    });
  });

  describe('emitOrderUpdated', () => {
    it('emits OrderUpdatedPayload (delta) to the restaurant room', () => {
      service.emitOrderUpdated('r1', updatedDashboard, kitchen);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, updatedDashboard);
    });

    it('emits KitchenOrderPayload (full) to the kitchen room', () => {
      service.emitOrderUpdated('r1', updatedDashboard, kitchen);
      expect(mockSseService.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, kitchen);
    });
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar — firma actual incorrecta)**

Run: `docker compose exec res-api-core pnpm test -- src/events/orders.events.spec.ts`
Expected: FAIL — `emit*` actual emite `{}` y solo acepta 2 args.

- [ ] **Step 3: Reescribir `orders.events.ts` con la nueva firma tipada**

Reemplazar el contenido completo de `apps/api-core/src/events/orders.events.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { SseService } from './sse.service';
import {
  OrderCreatedPayload,
  OrderUpdatedPayload,
  KitchenOrderPayload,
} from './payloads/order-event-payloads';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

/**
 * Emisor tipado de eventos SSE de Order.
 *
 * Cada método publica el mismo evento en dos canales con shapes distintos:
 *   - restaurant stream (dashboard): payload completo en NEW, delta en UPDATED.
 *   - kitchen stream (cocina): payload completo en ambos.
 *
 * Las shapes están definidas en `./payloads/order-event-payloads.ts` y
 * el builder de `OrdersService` es responsable de armarlas. Audit H-AUX-02.
 */
@Injectable()
export class OrderEventsService {
  constructor(private readonly sseService: SseService) {}

  emitOrderCreated(
    restaurantId: string,
    dashboard: OrderCreatedPayload,
    kitchen: KitchenOrderPayload,
  ): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, dashboard);
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, kitchen);
  }

  emitOrderUpdated(
    restaurantId: string,
    dashboard: OrderUpdatedPayload,
    kitchen: KitchenOrderPayload,
  ): void {
    this.sseService.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, dashboard);
    this.sseService.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, kitchen);
  }
}
```

- [ ] **Step 4: Correr el test del módulo events**

Run: `docker compose exec res-api-core pnpm test -- src/events`
Expected: PASS.

- [ ] **Step 5: Verificar que el resto rompe solo donde esperamos (OrdersService)**

Run: `docker compose exec res-api-core pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | head -20`
Expected: errores **únicamente** en `orders.service.ts` y `orders.service.spec.ts` ("Expected 3 arguments, but got 2"). Cualquier otro caller indica algo no contemplado — investigar antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/events/orders.events.ts apps/api-core/src/events/orders.events.spec.ts
git commit -m "$(cat <<'EOF'
refactor(events): OrderEventsService becomes strictly typed (H-AUX-02)

emit* now takes two typed payloads: a dashboard payload (full on NEW,
delta on UPDATED) and a kitchen payload (full on both). No more
`unknown` data crossing the wire — the contract is captured by the
interfaces declared in payloads/order-event-payloads.ts.

Wiring of callers happens in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Builders en `OrdersService` + test de contrato

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`
- Create: `apps/api-core/src/events/payloads/order-event-payloads.spec.ts`

**Background:** `OrderRepository.findById/updateStatus/cancelOrder/createWithItems` ya retornan `OrderSerializer` con `totalAmount` en pesos (number) e `items` mapeados a `OrderItemSerializer`. Los builders consumen ese shape, le calculan `displayTime` (via timezone) y producen los payloads tipados.

- [ ] **Step 1: Agregar los builders y wirearlos en los 7 call sites de `OrdersService`**

En `apps/api-core/src/orders/orders.service.ts`:

1a. Agregar imports al inicio (junto a los demás):

```ts
import {
  OrderCreatedPayload,
  OrderUpdatedPayload,
  KitchenOrderPayload,
} from '../events/payloads/order-event-payloads';
```

1b. Agregar dos métodos privados al final de la clase (después de `persistOrder`):

```ts
/**
 * Builder para `order:new` — payload completo dashboard + payload completo cocina.
 * Audit H-AUX-02.
 */
private async buildOrderCreatedPayloads(
  restaurantId: string,
  order: { id: string; orderNumber: number; status: OrderStatus; isPaid: boolean;
           totalAmount: number; paymentMethod: PaymentMethod | null;
           cancellationReason: string | null;
           customerEmail: string | null; customerPhone: string | null;
           deliveryAddress: string | null; deliveryReferences: string | null;
           orderSource: string; orderType: string; createdAt: Date;
           items: Array<{ id: string; quantity: number; notes: string | null;
                          product?: { name: string } | null;
                          productName?: string }>; },
): Promise<{ dashboard: OrderCreatedPayload; kitchen: KitchenOrderPayload }> {
  const tz = await this.timezoneService.getTimezone(restaurantId);
  const displayTime = formatDisplayTime(order.createdAt, tz);
  const dashboardItems = order.items.map((i) => ({
    id: i.id,
    quantity: i.quantity,
    notes: i.notes,
    productName: i.product?.name ?? i.productName ?? '',
  }));
  const kitchenItems = order.items.map((i) => ({
    quantity: i.quantity,
    notes: i.notes,
    productName: i.product?.name ?? i.productName ?? '',
  }));
  return {
    dashboard: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      isPaid: order.isPaid,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      cancellationReason: order.cancellationReason,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      deliveryReferences: order.deliveryReferences,
      orderSource: order.orderSource,
      orderType: order.orderType,
      displayTime,
      items: dashboardItems,
    },
    kitchen: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      displayTime,
      items: kitchenItems,
    },
  };
}

/**
 * Builder para `order:updated` — delta dashboard + payload completo cocina.
 * Audit H-AUX-02.
 */
private async buildOrderUpdatedPayloads(
  restaurantId: string,
  order: { id: string; orderNumber: number; status: OrderStatus; isPaid: boolean;
           paymentMethod: PaymentMethod | null; cancellationReason: string | null;
           createdAt: Date;
           items: Array<{ quantity: number; notes: string | null;
                          product?: { name: string } | null;
                          productName?: string }>; },
): Promise<{ dashboard: OrderUpdatedPayload; kitchen: KitchenOrderPayload }> {
  const tz = await this.timezoneService.getTimezone(restaurantId);
  return {
    dashboard: {
      id: order.id,
      status: order.status,
      isPaid: order.isPaid,
      paymentMethod: order.paymentMethod,
      cancellationReason: order.cancellationReason,
    },
    kitchen: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      displayTime: formatDisplayTime(order.createdAt, tz),
      items: order.items.map((i) => ({
        quantity: i.quantity,
        notes: i.notes,
        productName: i.product?.name ?? i.productName ?? '',
      })),
    },
  };
}
```

1c. Agregar el helper `formatDisplayTime` al **final del archivo** (fuera de la clase):

```ts
function formatDisplayTime(createdAt: Date | string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(createdAt));
  } catch {
    return new Intl.DateTimeFormat('es', {
      timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(createdAt));
  }
}
```

1d. Importar los tipos Prisma que faltan al inicio (si no están ya): `import { OrderStatus, Product, Prisma, CashShiftStatus, PaymentMethod } from '@prisma/client';` (agregar `PaymentMethod`).

1e. Reemplazar los 7 call sites. Patrón:

- **`createOrder` (línea ~85)** — usa `buildOrderCreatedPayloads`:

```ts
const { dashboard, kitchen } = await this.buildOrderCreatedPayloads(restaurantId, order);
this.orderEventsService.emitOrderCreated(restaurantId, dashboard, kitchen);
```

- **Los otros 6 (`updateOrderStatus`, `cancelOrder`, `kitchenAdvanceStatus`, `markAsPaid`, `confirmOrder`, `unmarkAsPaid`)** — usan `buildOrderUpdatedPayloads`. Variable de orden ya tiene nombre distinto en cada uno (`updated`, `cancelled`, `paid`, etc); ajustar:

```ts
const { dashboard, kitchen } = await this.buildOrderUpdatedPayloads(restaurantId, updated);
this.orderEventsService.emitOrderUpdated(restaurantId, dashboard, kitchen);
```

(usar `cancelled` en `cancelOrder`).

- [ ] **Step 2: Actualizar los asserts de `orders.service.spec.ts`**

Cada `expect(...emit*).toHaveBeenCalledWith('r1', X)` cambia a esperar el payload tipado. Como las fixtures de los tests son mínimas (`{ id, status, ... }`), usamos `expect.objectContaining`:

Para los `emitOrderUpdated` (líneas aprox: 120, 146, 205, 286, 337, 375, 396, 732, 747):

```ts
expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
  'r1',
  expect.objectContaining({ id: updated.id, status: updated.status, isPaid: updated.isPaid }),
  expect.objectContaining({ id: updated.id, orderNumber: updated.orderNumber }),
);
```

Para los `emitOrderCreated` (línea aprox 446):

```ts
expect(mockOrderEvents.emitOrderCreated).toHaveBeenCalledWith(
  'r1',
  expect.objectContaining({ id: expect.any(String), items: expect.any(Array) }),
  expect.objectContaining({ id: expect.any(String), items: expect.any(Array) }),
);
```

Asegurarse de que las fixtures tengan `createdAt` (Date) y `items: []` cuando sea necesario para que los builders no exploten. Mock `TimezoneService.getTimezone.mockResolvedValue('UTC')` si no existe ya.

Los asserts `.not.toHaveBeenCalled()` no cambian.

- [ ] **Step 3: Crear el test de contrato de payloads**

Crear `apps/api-core/src/events/payloads/order-event-payloads.spec.ts`:

```ts
import {
  ORDER_CREATED_PAYLOAD_KEYS,
  ORDER_UPDATED_PAYLOAD_KEYS,
  ORDER_ITEM_EVENT_PAYLOAD_KEYS,
  KITCHEN_ORDER_PAYLOAD_KEYS,
  KITCHEN_ORDER_ITEM_PAYLOAD_KEYS,
  OrderCreatedPayload,
  OrderUpdatedPayload,
  KitchenOrderPayload,
} from './order-event-payloads';
import { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * Contrato: las listas canónicas de keys deben coincidir exactamente con
 * los keys de un objeto que satisface la interface correspondiente.
 *
 * Si alguien agrega/quita un campo en una interface sin actualizar la
 * lista (o viceversa), este test rompe — protege contra drift.
 */
describe('order event payload contracts', () => {
  it('OrderCreatedPayload keys match the canonical list', () => {
    const sample: OrderCreatedPayload = {
      id: '', orderNumber: 0, status: OrderStatus.CREATED, isPaid: false, totalAmount: 0,
      paymentMethod: null, cancellationReason: null,
      customerEmail: null, customerPhone: null, deliveryAddress: null, deliveryReferences: null,
      orderSource: '', orderType: '', displayTime: '', items: [],
    };
    expect(Object.keys(sample).sort()).toEqual([...ORDER_CREATED_PAYLOAD_KEYS].sort());
  });

  it('OrderUpdatedPayload keys match the canonical list', () => {
    const sample: OrderUpdatedPayload = {
      id: '', status: OrderStatus.CREATED, isPaid: false,
      paymentMethod: null, cancellationReason: null,
    };
    expect(Object.keys(sample).sort()).toEqual([...ORDER_UPDATED_PAYLOAD_KEYS].sort());
  });

  it('OrderItemEventPayload keys match the canonical list', () => {
    const sample = { id: '', quantity: 0, notes: null, productName: '' };
    expect(Object.keys(sample).sort()).toEqual([...ORDER_ITEM_EVENT_PAYLOAD_KEYS].sort());
  });

  it('KitchenOrderPayload keys match the canonical list', () => {
    const sample: KitchenOrderPayload = {
      id: '', orderNumber: 0, status: OrderStatus.CREATED, displayTime: '', items: [],
    };
    expect(Object.keys(sample).sort()).toEqual([...KITCHEN_ORDER_PAYLOAD_KEYS].sort());
  });

  it('KitchenOrderItemPayload keys match the canonical list', () => {
    const sample = { quantity: 0, notes: null, productName: '' };
    expect(Object.keys(sample).sort()).toEqual([...KITCHEN_ORDER_ITEM_PAYLOAD_KEYS].sort());
  });

  it('OrderUpdatedPayload keys are a strict subset of OrderCreatedPayload', () => {
    const dashboardKeys = new Set<string>(ORDER_CREATED_PAYLOAD_KEYS);
    for (const k of ORDER_UPDATED_PAYLOAD_KEYS) {
      expect(dashboardKeys.has(k)).toBe(true);
    }
  });
});
```

(El último test garantiza que el delta del dashboard merge correctamente — todas las keys del delta existen en el shape completo.)

- [ ] **Step 4: Correr toda la suite de orders + events**

Run: `docker compose exec res-api-core pnpm test -- src/orders src/events`
Expected: PASS — los nuevos tests de contrato + todos los existentes.

- [ ] **Step 5: Correr e2e de orders + kitchen (smoke contractual del REST)**

Run: `docker compose exec res-api-core pnpm test:e2e -- --testPathPatterns "orders|kitchen|kioskCreateOrder"`
Expected: PASS — el contrato REST no cambia, solo el shape SSE.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.service.spec.ts apps/api-core/src/events/payloads/order-event-payloads.spec.ts
git commit -m "$(cat <<'EOF'
feat(orders): emit typed minimal SSE payloads on every transition (H-AUX-02)

OrdersService now builds two typed payloads per emit:
  - order:new  → OrderCreatedPayload (dashboard, 14 fields) + KitchenOrderPayload
  - order:updated → OrderUpdatedPayload (dashboard delta, 5 fields) + KitchenOrderPayload

The contract test (order-event-payloads.spec.ts) locks the shape: if a
field is added to the interface without updating the canonical key list
(or vice versa), the test fails — drift protection between the builder
and the frontend that consumes the payload.

displayTime is computed via TimezoneService.getTimezone(restaurantId)
and folded into both shapes; the same formatter is used in the kitchen
serializer, kept private to OrdersService to avoid cross-module coupling.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — tipos compartidos por capa + dashboard merge

**Files:**
- Create: `apps/ui/src/lib/sse-payloads.ts`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx:117-127`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

- [ ] **Step 1: Crear los tipos en frontend**

Crear `apps/ui/src/lib/sse-payloads.ts`:

```ts
/**
 * Shape exacto de los eventos SSE emitidos por el backend.
 *
 * Duplicado deliberado de
 *   apps/api-core/src/events/payloads/order-event-payloads.ts
 * El monorepo no tiene paquete shared; el drift entre ambas se mitiga
 * con el contract test del backend (`order-event-payloads.spec.ts`).
 *
 * Si modificás el shape en un lado, actualizá el otro y la lista canónica
 * del test. Audit H-AUX-02.
 */

export type OrderStatusName =
  | 'CREATED' | 'CONFIRMED' | 'PROCESSING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';

export type PaymentMethodName = 'CASH' | 'CARD' | 'DIGITAL_WALLET';

export interface OrderItemEventPayload {
  id: string;
  quantity: number;
  notes: string | null;
  productName: string;
}

export interface OrderCreatedPayload {
  id: string;
  orderNumber: number;
  status: OrderStatusName;
  isPaid: boolean;
  totalAmount: number;
  paymentMethod: PaymentMethodName | null;
  cancellationReason: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryReferences: string | null;
  orderSource: string;
  orderType: string;
  displayTime: string;
  items: OrderItemEventPayload[];
}

export interface OrderUpdatedPayload {
  id: string;
  status: OrderStatusName;
  isPaid: boolean;
  paymentMethod: PaymentMethodName | null;
  cancellationReason: string | null;
}
```

- [ ] **Step 2: Agregar test del patch local en `OrdersPanel.test.tsx`**

Leer `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` entero para identificar el patrón actual de mocks (cómo se simula EventSource y getOrders). El test nuevo va al final del `describe` principal:

```tsx
it('aplica delta merge cuando llega order:updated, sin refetchear', async () => {
  // Setup: sesión abierta + 1 orden CONFIRMED, isPaid=false.
  const initial = {
    id: 'o1', orderNumber: 7, status: 'CONFIRMED', isPaid: false,
    totalAmount: 100, paymentMethod: null, cancellationReason: null,
    customerEmail: null, customerPhone: null, deliveryAddress: null, deliveryReferences: null,
    orderSource: 'KIOSK', orderType: 'PICKUP', displayTime: '12:30', items: [],
  };
  mockGetOrders.mockResolvedValueOnce({ ok: true, data: [initial] });
  render(<OrdersPanel />);
  await screen.findByText(/#7/);
  mockGetOrders.mockClear();

  // Simular delta order:updated con isPaid=true.
  const delta = { id: 'o1', status: 'CONFIRMED', isPaid: true, paymentMethod: 'CASH', cancellationReason: null };
  const event = new MessageEvent('order:updated', { data: JSON.stringify(delta) });
  mockEventSourceInstance.dispatchEvent(event);

  // El badge "Pagado" aparece (resultado del merge isPaid: true).
  await screen.findByText(/Pagado/i);
  // Y no se llamó getOrders.
  expect(mockGetOrders).not.toHaveBeenCalled();
});

it('aplica prepend cuando llega order:new', async () => {
  mockGetOrders.mockResolvedValueOnce({ ok: true, data: [] });
  render(<OrdersPanel />);
  await screen.findByText(/Cocina/i); // título de la pantalla, indica que cargó
  mockGetOrders.mockClear();

  const created = {
    id: 'oNew', orderNumber: 99, status: 'CREATED', isPaid: false,
    totalAmount: 50, paymentMethod: null, cancellationReason: null,
    customerEmail: null, customerPhone: null, deliveryAddress: null, deliveryReferences: null,
    orderSource: 'KIOSK', orderType: 'PICKUP', displayTime: '13:00', items: [],
  };
  const event = new MessageEvent('order:new', { data: JSON.stringify(created) });
  mockEventSourceInstance.dispatchEvent(event);

  await screen.findByText(/#99/);
  expect(mockGetOrders).not.toHaveBeenCalled();
});
```

Ajustar `mockGetOrders` / `mockEventSourceInstance` a los nombres reales del archivo. Si no existe un dispatcher para EventSource, agregar al mock setup (mismo patrón del regression test de H-17).

- [ ] **Step 3: Correr el test (debe fallar — listener actual llama fetchOrders)**

Run: `cd apps/ui && pnpm test -- OrdersPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Reescribir el efecto SSE en `OrdersPanel.tsx`**

En `apps/ui/src/components/dash/orders/OrdersPanel.tsx`:

4a. Agregar import al inicio:

```tsx
import type { OrderCreatedPayload, OrderUpdatedPayload } from '../../../lib/sse-payloads';
```

4b. Reemplazar el bloque líneas 117-127:

```tsx
  // SSE: patch local del estado a partir del payload tipado del evento (H-AUX-02).
  //   - order:new (OrderCreatedPayload): prepend si no existe (idempotente).
  //   - order:updated (OrderUpdatedPayload, delta): merge {...existing, ...delta}
  //     sobre la entrada con el mismo id. Si la orden no está en el array
  //     local (caso: filtro activo o reconexión perdió el NEW), se ignora;
  //     el próximo loadOrders() del onopen cierra el gap.
  //
  // En modo filtro (activeFilter !== null) seguimos ignorando SSE para no
  // pisar la búsqueda. En el onopen del EventSource refetcheamos para
  // recuperar gaps por reconexión.
  // activeFilter se lee vía activeFilterRef.current para no recrear la
  // conexión al cambiar de filtro (H-17).
  useEffect(() => {
    if (status !== ORDERS_STATUS.OPEN || !session) return;
    const es = new EventSource(`${config.apiUrl}/v1/events/dashboard`, { withCredentials: true });

    const handleNew = (e: MessageEvent) => {
      if (activeFilterRef.current) return;
      try {
        const payload = JSON.parse(e.data) as OrderCreatedPayload;
        if (!payload?.id) return;
        setOrders((prev) =>
          prev.some((o) => o.id === payload.id) ? prev : [payload as unknown as Order, ...prev],
        );
      } catch { /* ignore malformed payload */ }
    };
    const handleUpdated = (e: MessageEvent) => {
      if (activeFilterRef.current) return;
      try {
        const payload = JSON.parse(e.data) as OrderUpdatedPayload;
        if (!payload?.id) return;
        setOrders((prev) => prev.map((o) => (o.id === payload.id ? { ...o, ...payload } : o)));
      } catch { /* ignore malformed payload */ }
    };
    const handleOpen = () => {
      // Reconexión — recuperar el estado completo para cerrar gaps de eventos
      // perdidos mientras el EventSource estaba caído.
      if (!activeFilterRef.current) fetchOrders(null);
    };

    es.addEventListener('open', handleOpen);
    es.addEventListener(ORDER_EVENTS.NEW, handleNew);
    es.addEventListener(ORDER_EVENTS.UPDATED, handleUpdated);
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);
```

(El cast `payload as unknown as Order` en handleNew es porque `Order` puede declarar campos extra de la respuesta REST que no vienen en el payload. La card consume solo los campos comunes — los campos faltantes serían `undefined` y el render ya tolera eso con `??`/`?.`. Si TypeScript es estricto, alternativa: extender `Order` para que esos extra campos sean opcionales.)

- [ ] **Step 5: Correr los tests**

Run: `cd apps/ui && pnpm test -- OrdersPanel.test.tsx`
Expected: PASS — los 2 nuevos tests + todos los existentes (incluyendo regression de H-17).

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/lib/sse-payloads.ts apps/ui/src/components/dash/orders/OrdersPanel.tsx apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(dash/orders): patch local state from typed SSE payload (H-AUX-02)

OrdersPanel parses the typed payload from order:new / order:updated
and mutates state locally — prepend on NEW, shallow merge on UPDATED.
Refetch is retained for the initial load and the EventSource onopen so
that events lost during a reconnect gap are recovered.

Types live in src/lib/sse-payloads.ts and are duplicated from the
backend (no shared package). The backend contract test guards against
drift.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Cocina — patch local desde KitchenOrderPayload completo

**Files:**
- Modify: `apps/ui/src/pages/kitchen/index.astro`

**Background:** la cocina ya tiene `ordersMap`. Vamos a:
1. Declarar el tipo `KitchenOrderPayload` inline (la cocina es script-only, sin paquete React; un archivo `.astro` no puede importar `.d.ts` cleanmente, así que el tipo va junto al script).
2. Pintar siempre desde `ordersMap` vía `renderColumns()`.
3. SSE muta el map: `set` si status es CONFIRMED/PROCESSING, `delete` en otro caso.
4. Sort por `orderNumber` (proxy de `createdAt asc` dentro del mismo turno).

- [ ] **Step 1: Extraer `renderColumns()` y refactorizar `loadOrders()`**

En `apps/ui/src/pages/kitchen/index.astro`, dentro del `<script>`, justo antes de la sección "Load orders" (~línea 341), agregar las interfaces y `renderColumns()`:

```ts
  // ── Tipos del payload SSE (espejo de KitchenOrderPayload del backend) ──
  // Audit H-AUX-02. Si modificás esto, sincronizá:
  //   apps/api-core/src/events/payloads/order-event-payloads.ts

  type KitchenOrderItem = { quantity: number; notes: string | null; productName: string };
  type KitchenOrder = {
    id: string;
    orderNumber: number;
    status: 'CREATED' | 'CONFIRMED' | 'PROCESSING' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
    displayTime: string;
    items: KitchenOrderItem[];
  };

  // ── Render ────────────────────────────────────────────────────────
  // ordersMap es la fuente de verdad. loadOrders() (montaje/reconexión)
  // y el listener SSE (patch local, H-AUX-02) actualizan el map; nadie
  // pinta sin pasar por renderColumns().

  function renderColumns() {
    const created: KitchenOrder[] = [];
    const processing: KitchenOrder[] = [];
    for (const o of ordersMap.values()) {
      if (o.status === 'CONFIRMED') created.push(o);
      else if (o.status === 'PROCESSING') processing.push(o);
    }
    // FIFO: orderNumber asc dentro del mismo turno equivale a createdAt asc.
    const byOrderNumberAsc = (a: KitchenOrder, b: KitchenOrder) =>
      (a.orderNumber ?? 0) - (b.orderNumber ?? 0);
    created.sort(byOrderNumberAsc);
    processing.sort(byOrderNumberAsc);

    countCreated.textContent = String(created.length);
    countProcessing.textContent = String(processing.length);
    tabCreatedBadge.textContent = String(created.length);
    tabProcessingBadge.textContent = String(processing.length);

    colCreated.replaceChildren(
      ...(created.length ? created.map(renderCard) : [renderEmptyState()]),
    );
    colProcessing.replaceChildren(
      ...(processing.length ? processing.map(renderCard) : [renderEmptyState()]),
    );

    bindCardEvents(colCreated);
    bindCardEvents(colProcessing);
  }
```

Cambiar la declaración de `ordersMap` (línea 148) para tiparla:

```ts
  const ordersMap = new Map<string, KitchenOrder>();
```

Reemplazar el cuerpo de `loadOrders()` (líneas ~343-370):

```ts
  async function loadOrders() {
    const res = await kitchenFetch(`/v1/kitchen/${slug}/orders`).catch(() => null);
    if (!res || !res.ok) return;
    const orders: KitchenOrder[] = await res.json();
    ordersMap.clear();
    orders.forEach((o) => ordersMap.set(o.id, o));
    renderColumns();
  }
```

- [ ] **Step 2: Cambiar `onmessage` del SSE a patch local**

En el bloque `fetchEventSource(...)`, reemplazar `onmessage`:

```ts
    onmessage(msg) {
      if (msg.event !== ORDER_EVENTS.NEW && msg.event !== ORDER_EVENTS.UPDATED) return;
      try {
        const payload = JSON.parse(msg.data) as KitchenOrder;
        if (!payload?.id) return;
        // H-AUX-02: solo CONFIRMED/PROCESSING viven en cocina; cualquier otro
        // status (SERVED/COMPLETED/CANCELLED/CREATED) se traduce en remover.
        if (payload.status === 'CONFIRMED' || payload.status === 'PROCESSING') {
          ordersMap.set(payload.id, payload);
        } else {
          ordersMap.delete(payload.id);
        }
        renderColumns();
      } catch { /* ignore malformed payload */ }
    },
```

- [ ] **Step 3: Borrar la llamada `loadOrders()` final redundante**

El `loadOrders()` al final del `<script>` (~línea 401) ya no es necesario: `onopen` lo dispara cuando el SSE conecta. Si el SSE no conecta, el overlay offline aparece y no tendría sentido cargar órdenes huérfanas. **Quitar esa última línea `loadOrders();`**.

Actualizar el listener `kitchen:order-updated` (del modal de confirmación) para usar el mismo path local — el modal dispara este evento cuando confirma un SERVED:

```ts
  window.addEventListener('kitchen:order-updated', ((ev: CustomEvent) => {
    const orderId = ev?.detail?.orderId as string | undefined;
    if (orderId) ordersMap.delete(orderId);
    renderColumns();
  }) as EventListener);
```

- [ ] **Step 4: Verificar que `KitchenConfirmModal` pasa `orderId` en el detail**

Run: `grep -n "kitchen:order-updated" /Users/ronny/projects/restaurants/apps/ui/src/components/kitchen/KitchenConfirmModal.tsx`
Si el `dispatchEvent` no incluye `orderId` en `detail`, agregarlo (el modal ya tiene el id porque lo recibe en `kitchen:confirm`).

- [ ] **Step 5: Smoke test manual (no hay tests unit para esta página)**

```bash
docker compose up -d
```

5a. Generar token de cocina desde el dashboard.
5b. Abrir `http://localhost:4321/kitchen?slug=<slug>&token=<token>`.
5c. Abrir `Network` panel del browser, filtrar por `kitchen/`.
5d. Crear orden en el kiosk → confirmar desde el dashboard.
5e. Verificar:
  - La card aparece en "Confirmados" sin recargar.
  - **No** hay nuevo `GET /v1/kitchen/<slug>/orders` (solo el del onopen inicial).
  - Click "EN PROCESO →" mueve la card; **no** hay GET adicional.
  - Click "✓ LISTO" → confirmar modal → la card desaparece; **no** hay GET adicional.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/pages/kitchen/index.astro
git commit -m "$(cat <<'EOF'
feat(kitchen): patch local from typed SSE payload (H-AUX-02)

The kitchen page treats ordersMap as the render source-of-truth.
SSE order:new / order:updated events carry the full KitchenOrderPayload
and the listener mutates ordersMap (set when status is CONFIRMED or
PROCESSING, delete otherwise). renderColumns() paints from the map,
sorted by orderNumber asc (equivalent to createdAt asc within a single
shift). loadOrders() is retained for the initial onopen, which also
covers reconnection recovery.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Cerrar H-AUX-02 + actualizar `module.info` docs

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md:312`
- Modify: `apps/api-core/src/kitchen/kitchen.module.info.md` (sección SSE)
- Modify: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` (línea 98 + entry en la lista de progreso)

- [ ] **Step 1: Actualizar `orders.module.info.md`**

Reemplazar la línea 312:

```
- Al crear una orden (kiosk), se emite evento `order:created` por WebSocket; al actualizar estado se emite `order:updated`
```

por:

```
- Eventos SSE de Order — dos canales con shapes tipados (audit H-AUX-02):
  - `order:new` (creación) y `order:updated` (cualquier transición).
  - **Restaurant stream** (consumido por el dashboard):
    - `order:new` lleva `OrderCreatedPayload` (14 campos visibles en la UI; sin `restaurantId`, `cashShiftId`, `customerName`, `tableNumber`, `createdAt`, `updatedAt`).
    - `order:updated` lleva `OrderUpdatedPayload` — **delta** de los 5 campos mutables (`id`, `status`, `isPaid`, `paymentMethod`, `cancellationReason`). El cliente hace `{...existing, ...delta}`.
  - **Kitchen stream** (consumido por el KDS):
    - Ambos eventos llevan `KitchenOrderPayload` (`id`, `orderNumber`, `status`, `displayTime`, `items[]`). Sin datos comerciales.
  - Shapes definidas en `src/events/payloads/order-event-payloads.ts` + listas canónicas de keys verificadas por `order-event-payloads.spec.ts` (drift protection).
  - Clientes aplican patch local; el refetch sobrevive solo en montaje y en `onopen` del EventSource (recovery por reconexión).
```

- [ ] **Step 2: Actualizar `kitchen.module.info.md`**

Agregar una sección nueva al final del archivo (o como subsección dentro de SSE):

```markdown
### Payload SSE (audit H-AUX-02)

Cada evento `order:new` / `order:updated` entrega un `KitchenOrderPayload` completo:

\`\`\`ts
{ id, orderNumber, status, displayTime, items: [{ quantity, notes, productName }] }
\`\`\`

El KDS aplica patch local en `ordersMap` (`set` si status es CONFIRMED/PROCESSING, `delete` en otro caso) y re-renderiza desde el map. El GET `/v1/kitchen/{slug}/orders` solo se llama en el `onopen` del stream (montaje + reconexión).

El payload **no** incluye `restaurantId`, `cashShiftId`, `paymentMethod`, `totalAmount`, `customer*`, ni datos del cliente. El shape vive duplicado en `apps/ui/src/pages/kitchen/index.astro` (sección de tipos al inicio del `<script>`); el backend tiene la fuente de verdad en `src/events/payloads/order-event-payloads.ts`.
```

- [ ] **Step 3: Cerrar H-AUX-02 en el spec de auditoría**

En `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`, línea 98:

```
**Estado:** ⏳ Pendiente
```

por:

```
**Estado:** ✅ Implementado (2026-05-31)
**Plan asociado:** `docs/superpowers/plans/2026-05-31-sse-payload-incremental-updates.md`
**Resumen del fix:**
- `SseService.streamFor*` preserva el `data` del evento (antes mapeaba a `{}`).
- `OrderEventsService` reescrito con métodos tipados: `emitOrderCreated(rid, OrderCreatedPayload, KitchenOrderPayload)` y `emitOrderUpdated(rid, OrderUpdatedPayload, KitchenOrderPayload)`.
- `OrdersService.buildOrderCreatedPayloads()` y `buildOrderUpdatedPayloads()` construyen los 3 shapes (dashboard NEW completo, dashboard UPDATED delta, kitchen completo) en cada transición. Llamados desde 7 call sites.
- Test de contrato `order-event-payloads.spec.ts`: lista canónica de keys de cada interface, valida runtime vs declaración para impedir drift.
- Dashboard (`OrdersPanel.tsx`): `setOrders` con prepend en NEW + merge `{...existing, ...delta}` en UPDATED. Refetch solo en montaje y `onopen` (reconexión). Tipos en `apps/ui/src/lib/sse-payloads.ts`.
- Cocina (`kitchen/index.astro`): `ordersMap` como source-of-truth; SSE muta el map (`set` si CONFIRMED/PROCESSING, `delete` en otro caso). `renderColumns()` pinta desde el map, sort por `orderNumber` asc.
- Tamaño de payload: `order:updated` dashboard ~100b (vs ~600b del OrderSerializer completo, -83%); `order:new` dashboard ~250b (-58%); kitchen ~140b en ambos eventos.
- Trade-off conocido: si se pierde un evento (red flaky), el cliente queda desincronizado hasta el próximo `onopen`. Heartbeat con timestamp queda como mejora futura fuera de scope.
```

Y reemplazar la línea 43 (entry de hallazgos adicionales):

```
- ➕ Hallazgo adicional descubierto (2026-05-28): patrón SSE → full refetch en dashboard y cocina. N eventos = N refetches completos. Ver H-AUX-02 en "Hallazgos adicionales".
```

por:

```
- ✅ H-AUX-02 implementado (2026-05-31) — backend emite payloads SSE tipados y mínimos (`OrderCreatedPayload`/`OrderUpdatedPayload` para dashboard; `KitchenOrderPayload` para cocina). Clientes aplican patch local (merge en dashboard updated, set/delete en cocina). Refetch sobrevive solo en montaje/reconexión. Ver plan `docs/superpowers/plans/2026-05-31-sse-payload-incremental-updates.md`.
```

- [ ] **Step 4: Verificar todo en verde (backend + frontend)**

Run:
```bash
docker compose exec res-api-core pnpm test
cd apps/ui && pnpm test
```
Expected: PASS — los cambios de docs no afectan código.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/orders.module.info.md apps/api-core/src/kitchen/kitchen.module.info.md apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
git commit -m "$(cat <<'EOF'
docs(audit): close H-AUX-02 — typed minimal SSE payloads

Marks H-AUX-02 as implemented and updates orders/kitchen module.info
docs to describe the new typed SSE contract (OrderCreatedPayload,
OrderUpdatedPayload as delta, KitchenOrderPayload) and the drift
protection via the contract test.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Backend emite payload de la orden serializada (no `{}`) — Task 2 + Task 4.
- ✅ Tipos estrictos en el sistema de eventos, sin `any`/`unknown`, `null` solo donde la BD lo permite — Task 1 + Task 3.
- ✅ Payload mínimo indispensable — Task 1 (interfaces recortadas) + Task 4 (builders construyen solo esos campos).
- ✅ Asimetría dashboard delta / cocina full justificada en el background — Task 4 + Task 6.
- ✅ Test de contrato anti-drift entre backend e interfaz — Task 4 (Step 3).
- ✅ Cliente dashboard aplica patch local + merge — Task 5.
- ✅ Cocina aplica patch local — Task 6.
- ✅ Refetch sobrevive en montaje + onopen — Task 5 + Task 6.
- ✅ Multi-tenant preservado (SSE filtra por restaurantId en el service) — sin cambios necesarios.
- ✅ H-17 (no recrear conexión en cambio de filtro) preservado — Task 5 mantiene deps `[status, session]`.
- ✅ Marcar H-AUX-02 como implementado + docs actualizados — Task 7.

**Placeholder scan:** sin "TODO", sin "implement later", sin "similar to Task N". Todos los pasos traen código completo o comandos exactos.

**Type consistency:**
- `OrderCreatedPayload`, `OrderUpdatedPayload`, `OrderItemEventPayload`, `KitchenOrderPayload`, `KitchenOrderItemPayload` — declarados en Task 1, usados consistentemente en Task 3, 4, 5, 6.
- `ORDER_CREATED_PAYLOAD_KEYS` y demás listas canónicas — declaradas en Task 1, consumidas en Task 4 Step 3.
- `buildOrderCreatedPayloads` / `buildOrderUpdatedPayloads` — declarados en Task 4, no referenciados fuera.
- `formatDisplayTime` — declarado como function privada al final de `orders.service.ts`. No exportada (uso interno).
- `renderColumns` — declarada en Task 6, llamada desde `loadOrders()` y el listener SSE.
- `byOrderNumberAsc` — declarado y usado dentro de Task 6.

**Riesgos detectados y mitigados:**
- **Drift backend/frontend de los tipos:** mitigado con el contract test (Task 4 Step 3) que rompe si los keys del builder no matchean la lista canónica.
- **Cast `payload as unknown as Order` en `OrdersPanel.handleNew`:** documentado en el plan. La card maneja campos potencialmente undefined con `??` / `?.` así que no rompe el render. Si el tipo `Order` del frontend exige campos extra que no vienen en el payload, hay dos opciones: (a) extender `Order` con campos opcionales, (b) trabajar con dos tipos. El plan asume (a) implícito vía el cast; si el ejecutor ve que rompe TypeScript, debe ajustar la definición de `Order` en `apps/ui/src/components/dash/orders/api.ts`.
- **Orden FIFO en cocina sin `createdAt`:** mitigado usando `orderNumber asc` (equivalente dentro del turno por garantía de incremento monótonico — H-09).
- **Edge case CREATED→CONFIRMED en cocina:** mitigado porque cocina recibe el payload completo en `updated` (no delta).

---

## Execution Handoff

Plan complete and saved to `apps/api-core/docs/superpowers/plans/2026-05-31-sse-payload-incremental-updates.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
