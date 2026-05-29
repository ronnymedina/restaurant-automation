import {
  BadRequestException, Injectable, Logger, Inject, forwardRef,
} from '@nestjs/common';
import { OrderStatus, Product, Prisma, CashShiftStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderNotFoundException,
  StockInsufficientException,
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  RegisterNotOpenException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';
import { EmailService } from '../email/email.service';
import { PrintService } from '../print/print.service';
import { OrderEventsService } from '../events/orders.events';
import { TimezoneService } from '../restaurants/timezone.service';
import { toUtcBoundary } from '../common/date.utils';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { OrderStateMachine } from './order-state-machine';

type OrderItemEntry = {
  productId: string;
  menuItemId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
};

type StockEntry = {
  product: Product;
  item: CreateOrderDto['items'][number];
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
    private readonly orderEventsService: OrderEventsService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => PrintService))
    private readonly printService: PrintService,
    private readonly timezoneService: TimezoneService,
    private readonly cashShiftRepository: CashShiftRepository,
  ) {}

  async createOrder(restaurantId: string, cashShiftId: string, dto: CreateOrderDto) {
    // Race-safe order creation (audit H-09). Without a lock, createOrder and
    // closeSession can interleave with write-skew: closeSession reads the
    // order set, createOrder writes a new order, and the closing totals miss
    // it. We acquire a row-level lock on the CashShift via lockShiftById
    // FIRST, inside the tx, before any write. Concurrent closeSession will
    // block on the same row and re-evaluate against the post-commit state;
    // concurrent createOrder calls serialize against each other. The
    // lastOrderNumber increment now lives INSIDE the tx so it rolls back if
    // the shift is closed mid-flight or any subsequent step fails.
    const order = await this.prisma.$transaction(async (tx) => {
      const status = await this.cashShiftRepository.lockShiftById(tx, cashShiftId);
      if (status === null || status !== CashShiftStatus.OPEN) {
        throw new RegisterNotOpenException();
      }

      const { lastOrderNumber } = await tx.cashShift.update({
        where: { id: cashShiftId },
        data: { lastOrderNumber: { increment: 1 } },
        select: { lastOrderNumber: true },
      });

      const { orderItems, stockEntries, totalAmount } =
        await this.validateAndBuildItems(restaurantId, dto, tx);
      this.validateExpectedTotal(totalAmount, dto.expectedTotal);
      await this.decrementAllStock(stockEntries, tx);

      return this.persistOrder(
        { restaurantId, cashShiftId, totalAmount, dto, orderItems, orderNumber: lastOrderNumber },
        tx,
      );
    });

    this.orderEventsService.emitOrderCreated(restaurantId, order);

    void this.printService.printKitchenTicket(order.id).catch((err) =>
      this.logger.warn(`Kitchen print failed for order #${order.orderNumber}: ${err.message}`),
    );

    return { order };
  }

  async createStaffOrder(restaurantId: string, dto: CreateOrderDto) {
    const shift = await this.cashShiftRepository.findOpen(restaurantId);
    if (!shift) throw new RegisterNotOpenException();
    return this.createOrder(restaurantId, shift.id, { ...dto, orderSource: 'STAFF' });
  }

  async listOrders(
    restaurantId: string,
    statuses?: OrderStatus[],
    limit?: number,
    orderNumber?: number,
  ) {
    const shift = await this.cashShiftRepository.findOpen(restaurantId);
    if (!shift) throw new RegisterNotOpenException();
    return this.orderRepository.listOrders(restaurantId, shift.id, statuses, limit, orderNumber);
  }

  async findHistory(
    restaurantId: string,
    filters: { orderNumber?: number; status?: OrderStatus; dateFrom?: string; dateTo?: string; page: number; limit: number },
  ) {
    const timezone = await this.timezoneService.getTimezone(restaurantId);
    const dateFrom = filters.dateFrom
      ? toUtcBoundary(filters.dateFrom, timezone, 'start')
      : undefined;
    const dateTo = filters.dateTo
      ? toUtcBoundary(filters.dateTo, timezone, 'end')
      : undefined;

    return this.orderRepository.findHistory(restaurantId, {
      orderNumber: filters.orderNumber,
      status: filters.status,
      dateFrom,
      dateTo,
      page: filters.page,
      limit: filters.limit,
    });
  }

  async findById(id: string, restaurantId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order || order.restaurantId !== restaurantId) throw new OrderNotFoundException(id);
    return order;
  }

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);

    OrderStateMachine.assertCanAdvance(order.status, newStatus, 'cashier');

    if (newStatus === OrderStatus.COMPLETED) {
      OrderStateMachine.assertCanComplete(order.status, order.isPaid, order.id);
    }

    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

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

  /**
   * Avanza el estado de una orden desde la cocina (CONFIRMED → PROCESSING → SERVED).
   *
   * IMPORTANTE — Multi-tenant safety (audit H-20): `restaurantId` DEBE provenir
   * del actor autenticado (JWT del cajero o `KitchenTokenGuard.KITCHEN_RESTAURANT_KEY`),
   * nunca del body del request. La protección por `findFirst({ where: { id,
   * restaurantId } })` depende 100% de que el caller respete esta convención.
   * Cualquier endpoint nuevo que llame este método debe derivar `restaurantId`
   * del JWT/guard, jamás del cliente.
   */
  async kitchenAdvanceStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
    // Race-safe kitchen advance (audit H-13). Multiple KDS screens can
    // attempt to advance the same order simultaneously, and the cashier
    // can cancel mid-flight. We do the read + the conditional UPDATE
    // inside a single transaction and rely on transitionStatusIfMatches
    // (a row-level optimistic UPDATE on status = expected) to be the
    // source of truth. If the row drifted since we read it, count = 0
    // and we surface InvalidStatusTransitionException instead of silently
    // overwriting a cancellation or double-advancing.
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id, restaurantId } });
      if (!order) throw new OrderNotFoundException(id);
      if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);

      OrderStateMachine.assertCanAdvance(order.status, newStatus, 'kitchen');

      const count = await this.orderRepository.transitionStatusIfMatches(
        tx, id, restaurantId, order.status, newStatus,
      );
      if (count === 0) {
        // Status drifted between findFirst and the conditional UPDATE —
        // another transaction (a second KDS screen or the cashier
        // cancelling) committed first. Reject the now-stale advance.
        throw new InvalidStatusTransitionException(order.status, newStatus);
      }
    });

    // Re-fetch AFTER the transaction commits using the repository's
    // canonical loader, so the SSE event payload keeps the existing
    // response shape (items eager-loaded, BigInt money fields serialized
    // to decimal pesos via serializeOrder). Reading inside the tx via
    // findFirstOrThrow would skip both transformations and break the API
    // contract that consumers (kitchen UI, dashboards) rely on.
    const updated = await this.orderRepository.findById(id);
    if (!updated) throw new OrderNotFoundException(id);

    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  async markAsPaid(id: string, restaurantId: string, paymentMethod?: string) {
    // Race-safe mark-as-paid (audit H-05). Concurrent payment attempts and
    // mid-flight cancellations are real risks (e.g., a cashier double-clicks
    // "Cobrar" or two staff members process the same ticket). We do the read
    // + the conditional UPDATE inside a single transaction and rely on
    // transitionStatusIfMatchesAndUnpaid — an UPDATE guarded by both
    // `status = expectedStatus` AND `isPaid = false` — as the source of
    // truth. If the row drifted (status changed, already paid), count = 0
    // and we surface the appropriate error instead of silently rewriting
    // a cancellation or applying duplicate payment metadata.
    //
    // Validation order matters: not-found → cancelled → idempotent (isPaid)
    // → transition. The idempotent path short-circuits BEFORE attempting the
    // UPDATE so concurrent retries on an already-paid order return cleanly.
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id, restaurantId } });
      if (!order) throw new OrderNotFoundException(id);
      if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);
      if (order.isPaid) return; // idempotent — skip the transition

      const nextStatus =
        order.status === OrderStatus.CREATED ? OrderStatus.CONFIRMED :
        order.status === OrderStatus.SERVED  ? OrderStatus.COMPLETED :
        order.status;

      const count = await this.orderRepository.transitionStatusIfMatchesAndUnpaid(
        tx, id, restaurantId, order.status, nextStatus, paymentMethod,
      );
      if (count === 0) {
        // Status drifted or isPaid flipped between findFirst and the
        // conditional UPDATE — another transaction committed first. Reject.
        throw new InvalidStatusTransitionException(order.status, nextStatus);
      }
    });

    // Re-fetch AFTER the transaction commits using the repository's canonical
    // loader, so the SSE event payload keeps the existing response shape
    // (items eager-loaded, BigInt money fields serialized to decimal pesos
    // via serializeOrder). Same pattern as kitchenAdvanceStatus (H-13).
    const updated = await this.orderRepository.findById(id);
    if (!updated) throw new OrderNotFoundException(id);

    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  async confirmOrder(id: string, restaurantId: string) {
    const order = await this.findById(id, restaurantId);
    if (order.status !== OrderStatus.CREATED) {
      throw new InvalidStatusTransitionException(order.status, OrderStatus.CONFIRMED);
    }
    const updated = await this.orderRepository.updateStatus(id, OrderStatus.CONFIRMED);
    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  async unmarkAsPaid(id: string, restaurantId: string) {
    // Race-safe unmark-as-paid (audit H-06). Concurrent mark/unmark attempts
    // and mid-flight completion are real risks (e.g., a manager reverses a
    // payment while the cashier is finalizing the ticket). We do the read +
    // the conditional UPDATE inside a single transaction and rely on
    // unmarkAsPaidIfPaid — an UPDATE guarded by `isPaid = true` — as the
    // source of truth. If the row drifted (already unpaid, status COMPLETED),
    // count = 0 and we surface InvalidStatusTransitionException instead of
    // silently rewriting state.
    //
    // Validation order: not-found → COMPLETED rejected (new rule, you cannot
    // un-pay a closed-out order) → idempotent (isPaid=false) → conditional
    // UPDATE. The idempotent path short-circuits BEFORE attempting the UPDATE
    // so concurrent retries on an already-unpaid order return cleanly.
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id, restaurantId } });
      if (!order) throw new OrderNotFoundException(id);
      if (order.status === OrderStatus.COMPLETED) {
        throw new InvalidStatusTransitionException(order.status, order.status);
      }
      if (!order.isPaid) return; // idempotent — skip the transition

      const count = await this.orderRepository.unmarkAsPaidIfPaid(tx, id, restaurantId);
      if (count === 0) {
        // isPaid flipped between findFirst and the conditional UPDATE —
        // another transaction committed first. Reject the stale operation.
        throw new InvalidStatusTransitionException(order.status, order.status);
      }
    });

    // Re-fetch AFTER the transaction commits using the repository's canonical
    // loader, so the SSE event payload keeps the existing response shape
    // (items eager-loaded, BigInt money fields serialized to decimal pesos
    // via serializeOrder). Same pattern as kitchenAdvanceStatus (H-13) and
    // markAsPaid (H-05).
    const updated = await this.orderRepository.findById(id);
    if (!updated) throw new OrderNotFoundException(id);

    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  private async validateAndBuildItems(
    restaurantId: string,
    dto: CreateOrderDto,
    tx: Prisma.TransactionClient,
  ): Promise<{ orderItems: OrderItemEntry[]; stockEntries: StockEntry[]; totalAmount: number }> {
    const orderItems: OrderItemEntry[] = [];
    const stockEntries: StockEntry[] = [];

    for (const item of dto.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.restaurantId !== restaurantId) {
        throw new StockInsufficientException(item.productId, 0, item.quantity);
      }

      const unitPrice = Number(product.price);

      this.validateStock(product, item);

      orderItems.push({
        productId: item.productId,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
        notes: item.notes,
      });
      stockEntries.push({ product, item });
    }

    const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
    return { orderItems, stockEntries, totalAmount };
  }

  private validateStock(
    product: Product,
    item: CreateOrderDto['items'][number],
  ): void {
    if (product.stock !== null && product.stock < item.quantity) {
      throw new StockInsufficientException(product.name, product.stock, item.quantity);
    }
  }

  private validateExpectedTotal(totalAmount: number, expectedTotal?: bigint): void {
    // totalAmount is in Number centavos (computed in validateAndBuildItems).
    // expectedTotal arrives as BigInt centavos (DTO @Transform(toCents)).
    // Both sides are now in centavos: exact equality, no floating-point tolerance.
    if (expectedTotal !== undefined && BigInt(totalAmount) !== expectedTotal) {
      throw new BadRequestException(
        'Los precios de tu pedido han cambiado. Por favor revisa el carrito e intenta de nuevo.',
      );
    }
  }

  private async decrementAllStock(stockEntries: StockEntry[], tx: Prisma.TransactionClient): Promise<void> {
    // Sort by productId before acquiring row-level locks.
    //
    // Each updateMany below takes a row-level lock on the Product row for the duration
    // of the transaction. Without a consistent lock order, two concurrent transactions
    // with the same products in different positions can deadlock:
    //
    //   Tx A (items: [P2, P1]): lock(P2) → waiting for lock(P1) held by Tx B
    //   Tx B (items: [P1, P2]): lock(P1) → waiting for lock(P2) held by Tx A  ← deadlock
    //
    // Sorting by productId ensures every transaction acquires locks in the same order,
    // making circular waits impossible. One transaction blocks waiting for the other;
    // it never holds a lock the other needs while waiting for one the other holds.
    const sorted = [...stockEntries].sort((a, b) => a.product.id.localeCompare(b.product.id));

    for (const { product, item } of sorted) {
      if (product.stock !== null) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          // product.stock is stale (pre-transaction read); pass 0 to signal stock was depleted concurrently
          throw new StockInsufficientException(product.name, 0, item.quantity);
        }
      }
    }
  }

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
        customerName: params.dto.customerName,
        customerPhone: params.dto.customerPhone,
        deliveryAddress: params.dto.deliveryAddress,
        deliveryReferences: params.dto.deliveryReferences,
        initialStatus: params.dto.orderSource === 'STAFF' ? OrderStatus.CONFIRMED : undefined,
        orderSource: params.dto.orderSource ?? 'STAFF',
        orderType: params.dto.orderType ?? 'PICKUP',
        tableNumber: params.dto.tableNumber,
        items: params.orderItems,
      },
      tx,
    );
  }
}
