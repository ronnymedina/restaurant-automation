# Orders — Estado CONFIRMED y Rediseño del Flujo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `CONFIRMED` state into the order state machine so the kitchen only sees confirmed/paid orders, remove cancellation from the KDS, and wire up the dashboard UI to drive the new flow.

**Architecture:** Add `CONFIRMED` between `CREATED` and `PROCESSING` in the Prisma enum + STATUS_ORDER array. New service methods `confirmOrder` and `unmarkAsPaid` back two new PATCH endpoints (`/confirm`, `/unpay`). `markAsPaid` auto-confirms `CREATED` orders. `cancelOrder` gains an `isPaid` guard. The kitchen service swaps `CREATED` for `CONFIRMED` in its active-order filter and loses the `cancelOrder` method. The KDS and the Orders dashboard are updated accordingly.

**Tech Stack:** NestJS, Prisma/PostgreSQL, class-validator, React (Preact), Astro vanilla-JS KDS page

---

## File map

| File | Change |
|---|---|
| `apps/api-core/prisma/schema.prisma` | Add `CONFIRMED` to `OrderStatus`; add `orderSource`, `orderType`, `tableNumber` to `Order` |
| `apps/api-core/src/orders/exceptions/orders.exceptions.ts` | Add `CannotCancelPaidOrderException` |
| `apps/api-core/src/orders/order.repository.ts` | Add `markAsUnpaid()`; extend `CreateOrderData`; update `createWithItems` |
| `apps/api-core/src/orders/orders.service.ts` | Update `STATUS_ORDER`; update `cancelOrder`; update `markAsPaid`; add `confirmOrder`, `unmarkAsPaid`; pass new fields through `persistOrder` |
| `apps/api-core/src/orders/orders.controller.ts` | Add `PATCH /:id/confirm` and `PATCH /:id/unpay` |
| `apps/api-core/src/orders/dto/create-order.dto.ts` | Add `orderSource`, `orderType`, `tableNumber` |
| `apps/api-core/src/orders/dto/order.dto.ts` | Add `orderSource`, `orderType`, `tableNumber` to `OrderDto` |
| `apps/api-core/src/orders/orders.service.spec.ts` | Update STATUS_ORDER-related tests; add tests for new methods |
| `apps/api-core/src/kitchen/kitchen.service.ts` | Change active filter `CREATED→CONFIRMED`; remove `cancelOrder` |
| `apps/api-core/src/kitchen/kitchen.controller.ts` | Remove `PATCH /:slug/orders/:id/cancel` endpoint |
| `apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts` | Expose `orderType`, `tableNumber` |
| `apps/api-core/src/kitchen/kitchen.service.spec.ts` | Fix mock (`findActiveOrders` not `findByRestaurantId`); update/remove cancelOrder test |
| `apps/ui/src/components/dash/orders/types.ts` | Add `CONFIRMED` to `ORDER_STATUS` |
| `apps/ui/src/components/dash/orders/api.ts` | Add `confirmOrder()`, `unmarkOrderPaid()` |
| `apps/ui/src/components/dash/orders/OrderCard.tsx` | New button layout for CONFIRMED flow |
| `apps/ui/src/components/dash/orders/OrdersPanel.tsx` | Add `handleConfirm`, `handleUnpay`, `handleCancelAttempt`; fix `fetchOrders` orderNumber logic; add PROCESSING-cancel toast |
| `apps/ui/src/pages/kitchen/index.astro` | Change `CREATED→CONFIRMED` in filter + column; remove cancel button |

---

## Task 1 — Prisma migration: add CONFIRMED state and new Order fields

**Files:**
- Modify: `apps/api-core/prisma/schema.prisma`

- [ ] **Step 1: Edit the schema**

In `apps/api-core/prisma/schema.prisma`, update the `OrderStatus` enum and add three nullable fields to the `Order` model.

`OrderStatus` enum (around line 51) becomes:
```prisma
enum OrderStatus {
  CREATED
  CONFIRMED
  PROCESSING
  COMPLETED
  CANCELLED
}
```

Inside the `Order` model (after `cancellationReason String?`), add:
```prisma
orderSource  String?
orderType    String?
tableNumber  String?
```

- [ ] **Step 2: Run migration**

```bash
docker compose exec res-api-core pnpm exec prisma migrate dev --name add_confirmed_state_order_source_type
```

Expected: migration file created, applied, no errors.

- [ ] **Step 3: Generate Prisma client**

```bash
docker compose exec res-api-core pnpm exec prisma generate
```

Expected: client regenerated with CONFIRMED in the enum.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/prisma/schema.prisma apps/api-core/prisma/migrations/
git commit -m "feat(orders/db): add CONFIRMED state and orderSource/orderType/tableNumber fields"
```

---

## Task 2 — New exception: CannotCancelPaidOrderException

**Files:**
- Modify: `apps/api-core/src/orders/exceptions/orders.exceptions.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api-core/src/orders/orders.service.spec.ts`, add this block inside `describe('cancelOrder', ...)` after the existing tests:

```typescript
it('throws CannotCancelPaidOrderException when order is paid', async () => {
  mockOrderRepository.findById.mockResolvedValue(
    makeOrder({ status: OrderStatus.CREATED, isPaid: true }),
  );
  await expect(service.cancelOrder('o1', 'r1', 'reason'))
    .rejects.toThrow(CannotCancelPaidOrderException);
});

it('throws CannotCancelPaidOrderException when CONFIRMED and paid', async () => {
  mockOrderRepository.findById.mockResolvedValue(
    makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true }),
  );
  await expect(service.cancelOrder('o1', 'r1', 'reason'))
    .rejects.toThrow(CannotCancelPaidOrderException);
});
```

Also add the import at the top of the spec file:
```typescript
import {
  // ... existing imports ...
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';
```

- [ ] **Step 2: Run tests to see them fail**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: FAIL — `CannotCancelPaidOrderException` is not defined.

- [ ] **Step 3: Add the exception class**

At the end of `apps/api-core/src/orders/exceptions/orders.exceptions.ts`, append:

```typescript
export class CannotCancelPaidOrderException extends BaseException {
  constructor(orderId: string) {
    super(
      `Order '${orderId}' cannot be cancelled because it is already paid. Call PATCH /:id/unpay first.`,
      HttpStatus.CONFLICT,
      'CANNOT_CANCEL_PAID_ORDER',
      { orderId },
    );
  }
}
```

- [ ] **Step 4: Run tests again (still fail — service not wired yet)**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: FAIL — exception is defined but `cancelOrder` doesn't throw it yet. Keep going.

- [ ] **Step 5: Commit exception class**

```bash
git add apps/api-core/src/orders/exceptions/orders.exceptions.ts
git commit -m "feat(orders): add CannotCancelPaidOrderException"
```

---

## Task 3 — OrderRepository: markAsUnpaid + extend CreateOrderData

**Files:**
- Modify: `apps/api-core/src/orders/order.repository.ts`

- [ ] **Step 1: Extend `CreateOrderData` interface**

In `order.repository.ts`, update the `CreateOrderData` interface (line 38) to:

```typescript
export interface CreateOrderData {
  orderNumber: number;
  totalAmount: number;
  restaurantId: string;
  cashShiftId: string;
  paymentMethod?: string;
  customerEmail?: string;
  initialStatus?: OrderStatus;
  orderSource?: string;
  orderType?: string;
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

- [ ] **Step 2: Update `createWithItems` to use new fields**

Replace the `data: { ... }` block inside `createWithItems` (lines 61–84) with:

```typescript
const order = await client.order.create({
  data: {
    orderNumber: data.orderNumber,
    totalAmount: data.totalAmount,
    restaurantId: data.restaurantId,
    cashShiftId: data.cashShiftId,
    paymentMethod: data.paymentMethod as PaymentMethod,
    customerEmail: data.customerEmail,
    ...(data.initialStatus ? { status: data.initialStatus } : {}),
    orderSource: data.orderSource,
    orderType: data.orderType,
    tableNumber: data.tableNumber,
    items: {
      create: data.items.map((item) => ({
        productId: item.productId,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
      })),
    },
  },
  include: {
    items: {
      include: { product: true },
    },
  },
});
```

- [ ] **Step 3: Add `markAsUnpaid` method**

After the existing `markAsPaid` method (line 136), add:

```typescript
async markAsUnpaid(id: string) {
  const order = await this.prisma.order.update({
    where: { id },
    data: { isPaid: false },
    include: ORDER_WITH_ITEMS,
  });
  return serializeOrder(order);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/orders/order.repository.ts
git commit -m "feat(orders/repo): extend CreateOrderData with new fields; add markAsUnpaid"
```

---

## Task 4 — OrdersService: STATUS_ORDER + cancelOrder + markAsPaid + new methods

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Write failing tests for the new and modified behaviors**

In `orders.service.spec.ts`, make these changes:

**1a. Add `CannotCancelPaidOrderException` to imports** (already done in Task 2 Step 1).

**1b. Add missing `OrderStatus.CONFIRMED` tests to `describe('cancelOrder')`:**

The tests added in Task 2 Step 1 cover the `isPaid` guard.

Add also:
```typescript
it('allows cancellation of CONFIRMED order when not paid', async () => {
  const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
  mockOrderRepository.findById.mockResolvedValue(
    makeOrder({ status: OrderStatus.CONFIRMED, isPaid: false }),
  );
  mockOrderRepository.cancelOrder.mockResolvedValue(cancelled);
  await expect(service.cancelOrder('o1', 'r1', 'reason')).resolves.toEqual(cancelled);
});
```

**1c. Add `describe('confirmOrder')` block:**
```typescript
describe('confirmOrder', () => {
  it('throws InvalidStatusTransitionException when not in CREATED', async () => {
    mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));
    await expect(service.confirmOrder('o1', 'r1'))
      .rejects.toThrow(InvalidStatusTransitionException);
  });

  it('throws InvalidStatusTransitionException when PROCESSING', async () => {
    mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
    await expect(service.confirmOrder('o1', 'r1'))
      .rejects.toThrow(InvalidStatusTransitionException);
  });

  it('updates status to CONFIRMED and emits event', async () => {
    const confirmed = makeOrder({ status: OrderStatus.CONFIRMED });
    mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
    mockOrderRepository.updateStatus.mockResolvedValue(confirmed);
    const result = await service.confirmOrder('o1', 'r1');
    expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith('o1', OrderStatus.CONFIRMED);
    expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', confirmed);
    expect(result.status).toBe(OrderStatus.CONFIRMED);
  });
});
```

**1d. Add `describe('unmarkAsPaid')` block:**
```typescript
describe('unmarkAsPaid', () => {
  it('calls markAsUnpaid and emits event', async () => {
    const unpaid = makeOrder({ isPaid: false });
    mockOrderRepository.findById.mockResolvedValue(makeOrder({ isPaid: true }));
    mockOrderRepository.markAsUnpaid = jest.fn().mockResolvedValue(unpaid);
    const result = await service.unmarkAsPaid('o1', 'r1');
    expect(mockOrderRepository.markAsUnpaid).toHaveBeenCalledWith('o1');
    expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', unpaid);
    expect(result.isPaid).toBe(false);
  });

  it('throws OrderNotFoundException when order not found', async () => {
    mockOrderRepository.findById.mockResolvedValue(null);
    await expect(service.unmarkAsPaid('o1', 'r1')).rejects.toThrow(OrderNotFoundException);
  });
});
```

**1e. Add test for `markAsPaid` auto-confirm:**

Inside `describe('markAsPaid')`, add:
```typescript
it('auto-confirms CREATED order when marking as paid', async () => {
  const paid = makeOrder({ isPaid: true, status: OrderStatus.CONFIRMED });
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
  mockOrderRepository.updateStatus.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));
  mockOrderRepository.markAsPaid.mockResolvedValue(paid);
  await service.markAsPaid('o1', 'r1');
  expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith('o1', OrderStatus.CONFIRMED);
});

it('does NOT call updateStatus when already CONFIRMED or PROCESSING', async () => {
  const paid = makeOrder({ isPaid: true, status: OrderStatus.CONFIRMED });
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));
  mockOrderRepository.markAsPaid.mockResolvedValue(paid);
  await service.markAsPaid('o1', 'r1');
  expect(mockOrderRepository.updateStatus).not.toHaveBeenCalled();
});
```

**1f. Update `describe('kitchenAdvanceStatus')` — CREATED → PROCESSING is now invalid:**

Replace the existing test `'advances CREATED → PROCESSING without isPaid check'` with CONFIRMED → PROCESSING:
```typescript
it('advances CONFIRMED → PROCESSING without isPaid check', async () => {
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));
  mockOrderRepository.updateStatus.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
  const result = await service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING);
  expect(result.status).toBe(OrderStatus.PROCESSING);
  expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalled();
});

it('throws InvalidStatusTransitionException when CREATED → PROCESSING (must confirm first)', async () => {
  mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
  await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING))
    .rejects.toThrow(InvalidStatusTransitionException);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: FAIL — `confirmOrder`, `unmarkAsPaid` not defined; `cancelOrder` doesn't guard `isPaid`.

- [ ] **Step 3: Update `orders.service.ts`**

**3a. Update imports** — add `CannotCancelPaidOrderException` to the import from exceptions:
```typescript
import {
  OrderNotFoundException,
  StockInsufficientException,
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
  RegisterNotOpenException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';
```

**3b. Update STATUS_ORDER** (line 26):
```typescript
const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.COMPLETED,
];
```

**3c. Replace `cancelOrder` method** (lines 157–168):
```typescript
async cancelOrder(id: string, restaurantId: string, reason: string) {
  const order = await this.findById(id, restaurantId);

  if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);
  if (order.status === OrderStatus.COMPLETED) {
    throw new InvalidStatusTransitionException(order.status, OrderStatus.CANCELLED);
  }
  if (order.isPaid) throw new CannotCancelPaidOrderException(id);

  const cancelled = await this.orderRepository.cancelOrder(id, reason);
  this.orderEventsService.emitOrderUpdated(restaurantId, cancelled);
  return cancelled;
}
```

**3d. Replace `markAsPaid` method** — add auto-confirm before the `markAsPaid` repo call (lines 187–207). Replace the full method:
```typescript
async markAsPaid(id: string, restaurantId: string) {
  const order = await this.findById(id, restaurantId);

  if (order.status === OrderStatus.CREATED) {
    await this.orderRepository.updateStatus(id, OrderStatus.CONFIRMED);
  }

  const updatedOrder = await this.orderRepository.markAsPaid(id);
  this.orderEventsService.emitOrderUpdated(restaurantId, updatedOrder);

  void this.printService.printReceipt(id).catch((err) =>
    this.logger.warn(`Receipt print failed for order ${id}: ${err.message}`),
  );

  if (updatedOrder.customerEmail && this.emailService) {
    try {
      const receipt = await this.printService.generateReceipt(id);
      await this.emailService.sendReceiptEmail(updatedOrder.customerEmail, receipt);
    } catch (error) {
      this.logger.error(`Failed to send receipt email for order ${id}`, error);
    }
  }

  return updatedOrder;
}
```

**3e. Add `confirmOrder` method** — insert after `markAsPaid`:
```typescript
async confirmOrder(id: string, restaurantId: string) {
  const order = await this.findById(id, restaurantId);
  if (order.status !== OrderStatus.CREATED) {
    throw new InvalidStatusTransitionException(order.status, OrderStatus.CONFIRMED);
  }
  const updated = await this.orderRepository.updateStatus(id, OrderStatus.CONFIRMED);
  this.orderEventsService.emitOrderUpdated(restaurantId, updated);
  return updated;
}
```

**3f. Add `unmarkAsPaid` method** — insert after `confirmOrder`:
```typescript
async unmarkAsPaid(id: string, restaurantId: string) {
  await this.findById(id, restaurantId);
  const updatedOrder = await this.orderRepository.markAsUnpaid(id);
  this.orderEventsService.emitOrderUpdated(restaurantId, updatedOrder);
  return updatedOrder;
}
```

**3g. Update `persistOrder` method** — pass new fields to the repository:
```typescript
private async persistOrder(
  params: {
    restaurantId: string;
    cashShiftId: string;
    totalAmount: number;
    dto: CreateOrderDto;
    orderItems: OrderItemEntry[];
    orderNumber: number;
  },
  tx: Prisma.TransactionClient,
) {
  return this.orderRepository.createWithItems(
    {
      orderNumber: params.orderNumber,
      totalAmount: params.totalAmount,
      restaurantId: params.restaurantId,
      cashShiftId: params.cashShiftId,
      paymentMethod: params.dto.paymentMethod,
      customerEmail: params.dto.customerEmail,
      initialStatus: params.dto.orderSource === 'STAFF' ? OrderStatus.CONFIRMED : undefined,
      orderSource: params.dto.orderSource,
      orderType: params.dto.orderType,
      tableNumber: params.dto.tableNumber,
      items: params.orderItems,
    },
    tx,
  );
}
```

Also add `markAsUnpaid` to `mockOrderRepository` in the spec file's mock (top of file):
```typescript
const mockOrderRepository = {
  findById: jest.fn(),
  createWithItems: jest.fn(),
  updateStatus: jest.fn(),
  cancelOrder: jest.fn(),
  markAsPaid: jest.fn(),
  markAsUnpaid: jest.fn(),
  listOrders: jest.fn(),
  findHistory: jest.fn(),
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders.service
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.service.spec.ts
git commit -m "feat(orders): add CONFIRMED state, confirmOrder, unmarkAsPaid; guard cancelOrder with isPaid check"
```

---

## Task 5 — DTOs: new fields in CreateOrderDto and OrderDto

**Files:**
- Modify: `apps/api-core/src/orders/dto/create-order.dto.ts`
- Modify: `apps/api-core/src/orders/dto/order.dto.ts`

- [ ] **Step 1: Update `CreateOrderDto`**

Add `IsIn` to the import list at the top of `create-order.dto.ts`:
```typescript
import {
  IsArray,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsEnum,
  IsEmail,
} from 'class-validator';
```

Add these three fields at the end of the `CreateOrderDto` class body, before the closing `}`:
```typescript
@ApiPropertyOptional({ example: 'STAFF', description: 'Origen del pedido: KIOSK | WEB | STAFF' })
@IsString()
@IsIn(['KIOSK', 'WEB', 'STAFF'])
@IsOptional()
orderSource?: string;

@ApiPropertyOptional({ example: 'PICKUP', description: 'Tipo de entrega: PICKUP | DELIVERY | DINE_IN' })
@IsString()
@IsIn(['PICKUP', 'DELIVERY', 'DINE_IN'])
@IsOptional()
orderType?: string;

@ApiPropertyOptional({ example: '5', description: 'Número de mesa. Requerido si orderType = DINE_IN' })
@IsString()
@IsOptional()
tableNumber?: string;
```

- [ ] **Step 2: Update `OrderDto`**

In `order.dto.ts`, add these three optional properties to the `OrderDto` class body after `cashShiftId`:
```typescript
@ApiPropertyOptional({ nullable: true }) orderSource: string | null;
@ApiPropertyOptional({ nullable: true }) orderType: string | null;
@ApiPropertyOptional({ nullable: true }) tableNumber: string | null;
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/orders/dto/create-order.dto.ts apps/api-core/src/orders/dto/order.dto.ts
git commit -m "feat(orders/dto): add orderSource, orderType, tableNumber fields"
```

---

## Task 6 — Controller: new /confirm and /unpay endpoints

**Files:**
- Modify: `apps/api-core/src/orders/orders.controller.ts`

- [ ] **Step 1: Add the two new PATCH endpoints**

In `orders.controller.ts`, after the existing `markAsPaid` handler (line 118–129), insert:

```typescript
@Patch(':id/confirm')
@ApiOperation({ summary: 'Confirmar pedido: CREATED → CONFIRMED (solo cajero)' })
@ApiParam({ name: 'id', description: 'ID de la orden', type: String })
@ApiResponse({ status: 200, description: 'Pedido confirmado', type: OrderDto })
@ApiResponse({ status: 400, description: 'Transición de estado inválida' })
@ApiResponse({ status: 404, description: 'Pedido no encontrado' })
async confirmOrder(
  @Param('id') id: string,
  @CurrentUser() user: { restaurantId: string },
) {
  return this.ordersService.confirmOrder(id, user.restaurantId);
}

@Patch(':id/unpay')
@ApiOperation({ summary: 'Desmarcar pago de una orden (paso previo para cancelar un pedido pagado)' })
@ApiParam({ name: 'id', description: 'ID de la orden', type: String })
@ApiResponse({ status: 200, description: 'Pago desmarcado', type: OrderDto })
@ApiResponse({ status: 404, description: 'Pedido no encontrado' })
async unmarkAsPaid(
  @Param('id') id: string,
  @CurrentUser() user: { restaurantId: string },
) {
  return this.ordersService.unmarkAsPaid(id, user.restaurantId);
}
```

- [ ] **Step 2: Run full tests**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=orders
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/orders/orders.controller.ts
git commit -m "feat(orders): add PATCH /confirm and PATCH /unpay endpoints"
```

---

## Task 7 — Kitchen module: remove cancelOrder, update active-order filter, expose new fields

**Files:**
- Modify: `apps/api-core/src/kitchen/kitchen.service.ts`
- Modify: `apps/api-core/src/kitchen/kitchen.controller.ts`
- Modify: `apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts`
- Modify: `apps/api-core/src/kitchen/kitchen.service.spec.ts`

- [ ] **Step 1: Write failing tests for kitchen service**

In `kitchen.service.spec.ts`, make these changes:

**1a. Fix the mock — use `findActiveOrders` (the current mock incorrectly uses `findByRestaurantId`):**
```typescript
const mockOrderRepository = {
  findActiveOrders: jest.fn(),
};
```

**1b. Update `describe('getActiveOrders')` test:**
```typescript
describe('getActiveOrders', () => {
  it('queries CONFIRMED and PROCESSING orders (not CREATED)', async () => {
    const orders = [
      { id: '1', status: OrderStatus.CONFIRMED, createdAt: new Date('2025-01-01T12:00:00Z'), items: [] },
      { id: '2', status: OrderStatus.PROCESSING, createdAt: new Date('2025-01-01T13:00:00Z'), items: [] },
    ];
    mockOrderRepository.findActiveOrders.mockResolvedValue(orders);
    const result = await service.getActiveOrders(makeRestaurant() as any);
    expect(result).toHaveLength(2);
    expect(mockOrderRepository.findActiveOrders).toHaveBeenCalledWith(
      'r1',
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
    );
  });
});
```

**1c. Remove `describe('cancelOrder')` block entirely** — kitchen can no longer cancel.

- [ ] **Step 2: Run tests to see them fail**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=kitchen.service
```

Expected: FAIL — mock doesn't match, tests don't compile yet.

- [ ] **Step 3: Update `kitchen.service.ts`**

**3a. Update `getActiveOrders`** — change `OrderStatus.CREATED` to `OrderStatus.CONFIRMED`:
```typescript
async getActiveOrders(restaurant: Restaurant) {
  const orders = await this.orderRepository.findActiveOrders(
    restaurant.id,
    [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
  );
  const tz = await this.timezoneService.getTimezone(restaurant.id);
  return orders.map((o) => new KitchenOrderSerializer(o, tz));
}
```

**3b. Delete the `cancelOrder` method entirely** (lines 38–42):

Remove:
```typescript
async cancelOrder(restaurant: Restaurant, orderId: string, reason: string) {
  const order = await this.ordersService.cancelOrder(orderId, restaurant.id, reason);
  const tz = await this.timezoneService.getTimezone(restaurant.id);
  return new KitchenOrderSerializer(order, tz);
}
```

- [ ] **Step 4: Update `kitchen.controller.ts` — remove cancel endpoint**

Delete the entire `@Patch(':slug/orders/:id/cancel')` handler block (lines 107–128), including its decorators.

Also remove the `CancelKitchenOrderDto` import since it's no longer used:
```typescript
// Remove this line:
import { CancelKitchenOrderDto } from './dto/cancel-kitchen-order.dto';
```

- [ ] **Step 5: Update `kitchen-order.serializer.ts` — expose orderType and tableNumber**

Add two `@Expose()` properties to the class body, after the `items` field:

```typescript
@ApiPropertyOptional({ nullable: true })
@Expose()
orderType: string | null;

@ApiPropertyOptional({ nullable: true })
@Expose()
tableNumber: string | null;
```

- [ ] **Step 6: Run tests**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=kitchen.service
```

Expected: all pass.

- [ ] **Step 7: Run full test suite to confirm no regressions**

```bash
docker compose exec res-api-core pnpm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api-core/src/kitchen/kitchen.service.ts \
        apps/api-core/src/kitchen/kitchen.controller.ts \
        apps/api-core/src/kitchen/serializers/kitchen-order.serializer.ts \
        apps/api-core/src/kitchen/kitchen.service.spec.ts
git commit -m "feat(kitchen): remove cancelOrder, filter CONFIRMED+PROCESSING, expose orderType/tableNumber"
```

---

## Task 8 — UI: update types.ts and api.ts

**Files:**
- Modify: `apps/ui/src/components/dash/orders/types.ts`
- Modify: `apps/ui/src/components/dash/orders/api.ts`

- [ ] **Step 1: Write a failing test for `confirmOrder`**

In `apps/ui/src/components/dash/orders/api.test.ts`, add:

```typescript
describe('confirmOrder', () => {
  it('calls PATCH /v1/orders/:id/confirm', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'o1', status: 'CONFIRMED' }),
    });
    const result = await confirmOrder('o1');
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/orders/o1/confirm'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('unmarkOrderPaid', () => {
  it('calls PATCH /v1/orders/:id/unpay', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'o1', isPaid: false }),
    });
    const result = await unmarkOrderPaid('o1');
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/orders/o1/unpay'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
```

Also add the imports at the top:
```typescript
import { confirmOrder, unmarkOrderPaid } from './api';
```

- [ ] **Step 2: Add `CONFIRMED` to types.ts**

Replace the `ORDER_STATUS` object in `apps/ui/src/components/dash/orders/types.ts`:

```typescript
export const ORDER_STATUS = {
  CREATED: 'CREATED',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
```

- [ ] **Step 3: Add `confirmOrder` and `unmarkOrderPaid` to api.ts**

At the end of `apps/ui/src/components/dash/orders/api.ts`, append:

```typescript
export async function confirmOrder(id: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/confirm`, { method: 'PATCH' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function unmarkOrderPaid(id: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/unpay`, { method: 'PATCH' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Step 4: Run UI tests**

```bash
cd apps/ui && pnpm test -- --testPathPattern=orders/api
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/types.ts \
        apps/ui/src/components/dash/orders/api.ts \
        apps/ui/src/components/dash/orders/api.test.ts
git commit -m "feat(ui/orders): add CONFIRMED state; add confirmOrder/unmarkOrderPaid api calls"
```

---

## Task 9 — UI: OrderCard new button layout

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`

- [ ] **Step 1: Update `OrderCard.tsx` with new button logic**

The new button rules per spec:

| State | Button | Callback |
|---|---|---|
| `CREATED` | "Confirmar" (blue) | `onConfirm(id)` |
| `CONFIRMED` | "Procesar" (blue) | `onAdvance(id, 'PROCESSING')` |
| `PROCESSING` | "Completar" (green) | `onAdvance(id, 'COMPLETED')` |
| active + `isPaid=true` | "Desmarcar Pago" (amber) | `onUnpay(id)` |
| active + `isPaid=false` | "Marcar Pagado" (emerald) | `onPay(id)` |
| active + `!isPaid` | "Cancelar" (red) | `onCancel(id)` |
| active + `isPaid=true` | "Cancelar" (red, dimmed) → inline warning | `onCancelBlocked(id)` |

Replace the entire file content of `OrderCard.tsx`:

```typescript
import type { Order } from './api';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Digital',
};

const BORDER_COLORS: Record<string, string> = {
  CREATED: 'border-l-yellow-400',
  CONFIRMED: 'border-l-purple-400',
  PROCESSING: 'border-l-blue-400',
  COMPLETED: 'border-l-green-400',
  CANCELLED: 'border-l-red-400',
};

const ACTIVE_STATUSES = new Set(['CREATED', 'CONFIRMED', 'PROCESSING']);

export interface OrderCardCallbacks {
  onConfirm: (id: string) => void;
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string) => void;
  onUnpay: (id: string) => void;
  onCancel: (id: string) => void;
  onCancelBlocked: (id: string) => void;
  onReceipt: (id: string) => void;
}

interface OrderCardProps extends OrderCardCallbacks {
  order: Order;
}

export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, onReceipt,
}: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';
  const isActive = ACTIVE_STATUSES.has(order.status);

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${border} shadow-sm`}>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800">#{order.orderNumber}</span>
          <span className="text-xs text-slate-500">{order.displayTime}</span>
        </div>
        <div className="space-y-0.5">
          {(order.items ?? []).map((item) => (
            <div key={item.id}>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{item.quantity}x</span> {item.product?.name ?? '?'}
              </p>
              {item.notes && (
                <p className="text-xs italic text-amber-600 ml-5">{item.notes}</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="font-semibold text-sm text-slate-800">
            ${Number(order.totalAmount).toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">
            {PAYMENT_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '-'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {order.isPaid ? (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">
              Pagado
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
              No pagado
            </span>
          )}
        </div>
        {order.status === 'CANCELLED' && order.cancellationReason && (
          <p className="text-xs text-red-600 italic mt-1">Motivo: {order.cancellationReason}</p>
        )}
        <div className="flex gap-1.5 flex-wrap pt-1">
          {order.status === 'CREATED' && (
            <button
              type="button"
              onClick={() => onConfirm(order.id)}
              className="flex-1 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg cursor-pointer border-none hover:bg-blue-600"
            >
              Confirmar
            </button>
          )}
          {order.status === 'CONFIRMED' && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'PROCESSING')}
              className="flex-1 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg cursor-pointer border-none hover:bg-blue-600"
            >
              Procesar
            </button>
          )}
          {order.status === 'PROCESSING' && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'COMPLETED')}
              className="flex-1 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg cursor-pointer border-none hover:bg-green-600"
            >
              Completar
            </button>
          )}
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onUnpay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg cursor-pointer border-none hover:bg-amber-200"
            >
              Desmarcar Pago
            </button>
          )}
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onPay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer border-none hover:bg-emerald-200"
            >
              Marcar Pagado
            </button>
          )}
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onCancel(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-red-100 text-red-700 rounded-lg cursor-pointer border-none hover:bg-red-200"
            >
              Cancelar
            </button>
          )}
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onCancelBlocked(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-slate-100 text-slate-400 rounded-lg cursor-pointer border-none"
              title="Desmarca el pago antes de cancelar"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => onReceipt(order.id)}
            className="py-1.5 px-2 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg cursor-pointer border-none hover:bg-slate-200"
          >
            Recibo
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(ui/orders): update OrderCard buttons for CONFIRMED state flow"
```

---

## Task 10 — UI: OrdersPanel new handlers + fetchOrders fix

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

- [ ] **Step 1: Update `OrdersPanel.tsx`**

**1a. Add imports for new API functions:**
```typescript
import {
  getCurrentSession, getOrders, updateOrderStatus, markOrderPaid, cancelOrder,
  confirmOrder, unmarkOrderPaid,
} from './api';
```

**1b. Fix `fetchOrders`** — don't apply default statuses when searching by orderNumber.

Replace the `fetchOrders` function:
```typescript
async function fetchOrders(filter: ActiveFilter | null) {
  const params: Parameters<typeof getOrders>[0] = { limit: 100 };

  if (filter?.orderNumber) {
    params.orderNumber = filter.orderNumber;
    if (filter.statuses.length) params.statuses = filter.statuses;
    // When searching by orderNumber, no default statuses — find in any state
  } else {
    params.statuses = filter?.statuses.length ? filter.statuses : ['CREATED', 'CONFIRMED', 'PROCESSING'];
  }

  const result = await getOrders(params);
  if (!result.ok) {
    if (result.httpStatus === 409 && result.error?.code === 'REGISTER_NOT_OPEN') {
      setStatus(ORDERS_STATUS.CLOSED);
    }
    return;
  }
  setOrders(result.data);
}
```

**1c. Add `handleConfirm`** — after `handleAdvance`:
```typescript
async function handleConfirm(id: string) {
  if (!session) return;
  const result = await confirmOrder(id);
  if (!result.ok) {
    showToast(result.error.message ?? 'Error al confirmar', true);
    return;
  }
  showToast('Pedido confirmado');
  await fetchOrders(activeFilter);
}
```

**1d. Add `handleUnpay`** — after `handlePay`:
```typescript
async function handleUnpay(id: string) {
  if (!session) return;
  const result = await unmarkOrderPaid(id);
  if (!result.ok) {
    showToast(result.error.message ?? 'Error al desmarcar pago', true);
    return;
  }
  showToast('Pago desmarcado');
  await fetchOrders(activeFilter);
}
```

**1e. Update `handleCancelConfirm`** — add PROCESSING-cancel special toast:
```typescript
async function handleCancelConfirm(id: string, reason: string) {
  if (!session) return;
  const order = orders.find((o) => o.id === id);
  const result = await cancelOrder(id, reason);
  if (!result.ok) {
    showToast(result.error.message ?? 'Error al cancelar', true);
    return;
  }
  setCancelOrderId(null);
  if (order?.status === 'PROCESSING') {
    showToast('⚠️ Pedido cancelado. Recuerda notificar a tu cocina.', false);
  } else {
    showToast('Pedido cancelado');
  }
  await fetchOrders(activeFilter);
}
```

**1f. Add `handleCancelBlocked`** — shows a message without opening the modal:
```typescript
function handleCancelBlocked(_id: string) {
  showToast('Este pedido está marcado como pagado. Desmarca el pago antes de cancelarlo.', true);
}
```

**1g. Update `cardCallbacks` object:**
```typescript
const cardCallbacks = {
  onConfirm: handleConfirm,
  onAdvance: handleAdvance,
  onPay: handlePay,
  onUnpay: handleUnpay,
  onCancel: (id: string) => setCancelOrderId(id),
  onCancelBlocked: handleCancelBlocked,
  onReceipt: handleReceipt,
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx
git commit -m "feat(ui/orders): add confirm/unpay handlers; fix fetchOrders orderNumber search; add PROCESSING cancel toast"
```

---

## Task 11 — UI: KDS kitchen page

**Files:**
- Modify: `apps/ui/src/pages/kitchen/index.astro`

- [ ] **Step 1: Update the kitchen KDS page**

The changes needed in `kitchen/index.astro`:

**1a. Rename column header from "Nuevos" to "Confirmados"** — in the HTML, find the `<h2>` with text "Nuevos" (line 41) and the `id="colCreated"` / `id="countCreated"` elements. These IDs can remain as-is for simplicity, but update the visible text:

Find:
```html
<h2 style="font-size:18px;font-weight:700;color:#facc15;text-transform:uppercase;letter-spacing:0.1em;">Nuevos</h2>
```
Replace with:
```html
<h2 style="font-size:18px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.1em;">Confirmados</h2>
```

Also update the badge color to purple to match the spec's CONFIRMED visual:
```html
<span id="countCreated" style="background:rgba(167,139,250,0.25);color:#c4b5fd;font-size:14px;font-weight:700;padding:4px 12px;border-radius:9999px;">0</span>
```

And its container background:
```html
<div style="background:rgba(139,92,246,0.15);border-bottom:1px solid rgba(139,92,246,0.3);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;">
```

**1b. Remove the cancel button from `renderCard`** — in the `renderCard` function, remove:
```javascript
const cancelBtn = `<button data-cancel="${order.id}"
  style="width:100%;padding:12px;font-size:15px;font-weight:700;background:rgba(127,29,29,0.4);color:#fca5a5;border:1px solid rgba(220,38,38,0.4);border-radius:12px;cursor:pointer;margin-top:4px;">
  Cancelar
</button>`;
```

And in the card template string, remove `${cancelBtn}` reference.

**1c. Update `loadOrders` to filter `CONFIRMED` (not `CREATED`)**:

Find:
```javascript
const created = orders.filter((o) => o.status === 'CREATED');
```
Replace with:
```javascript
const created = orders.filter((o) => o.status === 'CONFIRMED');
```

**1d. Remove cancel modal HTML** — the entire `<div id="cancelModal" ...>` block (lines 61–85) can be removed since the kitchen no longer cancels.

**1e. Remove cancel modal JavaScript** — in the `<script>` section, remove:
- `let pendingCancelId: string | null = null;` variable
- `openCancelModal`, `closeCancelModal` functions
- `cancelModalDismiss.addEventListener(...)` listeners
- `cancelModal.addEventListener(...)` listener
- `cancelModalConfirm.addEventListener(...)` listener with the `kitchenFetch` cancel call
- The `const cancelModal` / `cancelReasonInput` / `cancelReasonError` / `cancelModalDismiss` / `cancelModalConfirm` element references (lines 118–121)

**1f. Remove cancel button event binding** in `bindCardEvents` — remove:
```javascript
container.querySelectorAll('[data-cancel]').forEach((btn) => {
  btn.addEventListener('click', () => openCancelModal((btn as HTMLElement).dataset.cancel!));
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/pages/kitchen/index.astro
git commit -m "feat(ui/kitchen): show CONFIRMED orders, remove cancel capability from KDS"
```

---

## Self-review checklist

After writing the plan, verifying coverage against the spec:

| Spec requirement | Covered in |
|---|---|
| `CONFIRMED` state in enum + DB migration | Task 1 |
| `orderSource`, `orderType`, `tableNumber` in DB | Task 1 |
| `CannotCancelPaidOrderException` | Task 2 |
| `cancelOrder` blocks `isPaid=true` | Task 4 |
| `cancelOrder` allows `CONFIRMED` → `CANCELLED` | Task 4 |
| `markAsPaid` auto-confirms `CREATED` orders | Task 4 |
| `confirmOrder` service method | Task 4 |
| `unmarkAsPaid` service method | Task 4 |
| `persistOrder` passes `orderSource/orderType/tableNumber` | Task 4 |
| STAFF orders start as `CONFIRMED` | Task 4 |
| `STATUS_ORDER` updated to include `CONFIRMED` | Task 4 |
| `kitchenAdvanceStatus` `CONFIRMED→PROCESSING` valid | Task 4 (STATUS_ORDER fix makes it automatic) |
| `CreateOrderDto` new fields | Task 5 |
| `OrderDto` new fields | Task 5 |
| `PATCH /:id/confirm` endpoint | Task 6 |
| `PATCH /:id/unpay` endpoint | Task 6 |
| Kitchen filter `CONFIRMED+PROCESSING` | Task 7 |
| `cancelOrder` removed from kitchen | Task 7 |
| `KitchenOrderSerializer` exposes `orderType/tableNumber` | Task 7 |
| UI `ORDER_STATUS.CONFIRMED` | Task 8 |
| UI `confirmOrder()` API call | Task 8 |
| UI `unmarkOrderPaid()` API call | Task 8 |
| `OrderCard` "Confirmar" button for `CREATED` | Task 9 |
| `OrderCard` "Procesar" button for `CONFIRMED` | Task 9 |
| `OrderCard` "Desmarcar Pago" button | Task 9 |
| `OrderCard` cancel blocked warning when `isPaid=true` | Task 9 |
| `fetchOrders` fix: no default statuses when orderNumber | Task 10 |
| PROCESSING-cancel toast | Task 10 |
| KDS shows `CONFIRMED` orders (not `CREATED`) | Task 11 |
| KDS cancel button removed | Task 11 |

**Out of scope (deferred per spec):**
- `CANCELLED → CREATED` reactivation
- `COMPLETED → PROCESSING` revert
- WEB payment gateway webhook
