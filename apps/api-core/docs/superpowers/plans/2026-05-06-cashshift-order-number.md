# CashShift Order Number — Two-Phase Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `CashShift.lastOrderNumber` lock contention by moving the counter increment to a short, independent transaction before the main order creation transaction.

**Architecture:** `createOrder` calls `this.prisma.cashShift.update({ increment: 1 })` directly before entering `$transaction`. The resulting `lastOrderNumber` is passed into `persistOrder` as a parameter. `persistOrder` no longer touches `CashShift` at all. The main transaction only handles stock decrements and order/orderItem insertion.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest

---

## File Map

| File | Change |
|------|--------|
| `src/orders/orders.service.ts` | Move counter increment out of `persistOrder`; add `orderNumber` param to `persistOrder` |
| `src/orders/orders.service.spec.ts` | Add tests for call order and gap behavior |

---

### Task 1: Add failing tests for the two-phase counter behavior

**Files:**
- Modify: `src/orders/orders.service.spec.ts` (inside `describe('createOrder', ...)`)

- [ ] **Step 1: Add test — counter is incremented before the main transaction**

In `describe('createOrder', ...)`, after the existing tests, add:

```typescript
it('increments the order counter before the main transaction starts', async () => {
  mockPrisma.product.findUnique.mockResolvedValue({
    id: 'p1', restaurantId: 'r1', price: 5, stock: null, name: 'Widget',
  });

  await service.createOrder('r1', 'session1', baseDto as any);

  expect(mockPrisma.cashShift.update.mock.invocationCallOrder[0])
    .toBeLessThan(mockPrisma.$transaction.mock.invocationCallOrder[0]);
});
```

- [ ] **Step 2: Add test — gap behavior is explicit and expected**

```typescript
it('increments the counter even when the main transaction fails — gap is acceptable', async () => {
  mockPrisma.product.findUnique.mockResolvedValue(null);

  await expect(service.createOrder('r1', 'session1', baseDto as any)).rejects.toThrow(
    StockInsufficientException,
  );

  expect(mockPrisma.cashShift.update).toHaveBeenCalledWith({
    where: { id: 'session1' },
    data: { lastOrderNumber: { increment: 1 } },
    select: { lastOrderNumber: true },
  });
});
```

- [ ] **Step 3: Run the two new tests to verify they fail**

```bash
cd apps/api-core && pnpm test --testPathPattern=orders.service.spec --verbose 2>&1 | grep -E "PASS|FAIL|✓|✗|×|●"
```

Expected: both new tests **FAIL** (the counter is still inside the transaction and doesn't match the expected call signature with `select`).

---

### Task 2: Implement the two-phase counter in `orders.service.ts`

**Files:**
- Modify: `src/orders/orders.service.ts`

- [ ] **Step 1: Move the counter increment out of `persistOrder` and into `createOrder`**

Replace the entire `createOrder` method (lines 58–89) with:

```typescript
async createOrder(restaurantId: string, cashShiftId: string, dto: CreateOrderDto) {
  const { lastOrderNumber } = await this.prisma.cashShift.update({
    where: { id: cashShiftId },
    data: { lastOrderNumber: { increment: 1 } },
    select: { lastOrderNumber: true },
  });

  const order = await this.prisma.$transaction(async (tx) => {
    const { orderItems, stockEntries, totalAmount } = await this.validateAndBuildItems(restaurantId, dto, tx);
    this.validateExpectedTotal(totalAmount, dto.expectedTotal);
    await this.decrementAllStock(stockEntries, tx);
    const created = await this.persistOrder({ restaurantId, cashShiftId, totalAmount, dto, orderItems, orderNumber: lastOrderNumber }, tx);
    return created;
  });

  this.orderEventsService.emitOrderCreated(restaurantId, order);

  void this.printService.printKitchenTicket(order.id).catch((err) =>
    this.logger.warn(`Kitchen print failed for order #${order.orderNumber}: ${err.message}`),
  );

  if (PRINT_CUSTOMER_ON_CREATE) {
    void this.printService.printReceipt(order.id).catch((err) =>
      this.logger.warn(`Customer receipt print failed for order #${order.orderNumber}: ${err.message}`),
    );
  }

  // TODO(print-cloud): generateBoth is disabled — see docs/print-cloud.md
  // const tickets = await this.printService.generateBoth(order.id).catch(() => null);

  return {
    order,
    receipt: null,
    kitchenTicket: null,
  };
}
```

- [ ] **Step 2: Update `persistOrder` — remove the `cashShift.update` call, accept `orderNumber` as param**

Replace the entire `persistOrder` method (lines 274–301) with:

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
      items: params.orderItems,
    },
    tx,
  );
}
```

- [ ] **Step 3: Run the full test suite to verify all tests pass**

```bash
cd apps/api-core && pnpm test --testPathPattern=orders.service.spec --verbose 2>&1 | tail -30
```

Expected: all tests **PASS**, including the two new ones added in Task 1.

- [ ] **Step 4: Run the complete test suite to check for regressions**

```bash
cd apps/api-core && pnpm test 2>&1 | tail -20
```

Expected: no failures.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.service.spec.ts
git commit -m "perf(orders): move CashShift counter increment outside main transaction

Resolves ERR-05: under high concurrency the UPDATE CashShift.lastOrderNumber
held a row lock for the full duration of the order transaction (~300–600ms),
serializing all concurrent orders. Moving the increment to a short independent
call before \$transaction reduces the lock hold time to ~2ms.

Trade-off: if the main transaction fails after the counter increments, the
order number is burned (gap in sequence). Acceptable — orderNumber is a
display-only ticket number, not a business metric.

See docs/superpowers/specs/2026-05-06-cashshift-order-number-design.md"
```
