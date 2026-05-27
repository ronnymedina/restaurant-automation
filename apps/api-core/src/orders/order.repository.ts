import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { fromCents } from '../common/helpers/money';

const ORDER_WITH_ITEMS = {
  items: {
    include: { product: true, menuItem: true },
  },
} as const;

/**
 * Convert BigInt monetary fields (stored as centavos) to decimal pesos
 * before returning to the API layer. JSON does not support BigInt and
 * the convention across the API is to expose money in pesos.
 *
 * Applies to: totalAmount, items[].unitPrice, items[].subtotal,
 * items[].product.price, items[].menuItem.priceOverride.
 */
function serializeOrder<T extends Record<string, any>>(order: T): T {
  const result: Record<string, any> = { ...order };

  if (typeof result['totalAmount'] === 'bigint') {
    result['totalAmount'] = fromCents(result['totalAmount']);
  }

  if (Array.isArray(result['items'])) {
    result['items'] = result['items'].map((item: Record<string, any>) => {
      const si: Record<string, any> = { ...item };
      if (typeof si['unitPrice'] === 'bigint') si['unitPrice'] = fromCents(si['unitPrice']);
      if (typeof si['subtotal'] === 'bigint') si['subtotal'] = fromCents(si['subtotal']);
      if (si['product'] && typeof si['product']['price'] === 'bigint') {
        si['product'] = { ...si['product'], price: fromCents(si['product']['price']) };
      }
      if (si['menuItem'] && typeof si['menuItem']['priceOverride'] === 'bigint') {
        si['menuItem'] = { ...si['menuItem'], priceOverride: fromCents(si['menuItem']['priceOverride']) };
      }
      return si;
    });
  }

  return result as T;
}

export interface CreateOrderData {
  orderNumber: number;
  totalAmount: number;
  restaurantId: string;
  cashShiftId: string;
  paymentMethod?: string;
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

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) { }

  async createWithItems(data: CreateOrderData, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const order = await client.order.create({
      data: {
        orderNumber: data.orderNumber,
        totalAmount: data.totalAmount,
        restaurantId: data.restaurantId,
        cashShiftId: data.cashShiftId,
        paymentMethod: data.paymentMethod as PaymentMethod,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        deliveryAddress: data.deliveryAddress,
        deliveryReferences: data.deliveryReferences,
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
    return serializeOrder(order);
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_WITH_ITEMS,
    });
    return order ? serializeOrder(order) : null;
  }

  async findActiveOrders(restaurantId: string, statuses: OrderStatus[]) {
    const orders = await this.prisma.order.findMany({
      where: { restaurantId, status: { in: statuses } },
      include: ORDER_WITH_ITEMS,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(serializeOrder);
  }

  async listOrders(
    restaurantId: string,
    cashShiftId: string,
    statuses?: OrderStatus[],
    limit?: number,
    orderNumber?: number,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        cashShiftId,
        ...(statuses?.length ? { status: { in: statuses } } : {}),
        ...(orderNumber ? { orderNumber } : {}),
      },
      include: ORDER_WITH_ITEMS,
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
    return orders.map(serializeOrder);
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: ORDER_WITH_ITEMS,
    });
    return serializeOrder(order);
  }

  async cancelOrder(id: string, reason: string) {
    const order = await this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
      include: ORDER_WITH_ITEMS,
    });
    return serializeOrder(order);
  }

  async findHistory(
    restaurantId: string,
    filters: {
      orderNumber?: number;
      status?: OrderStatus;
      dateFrom?: Date;
      dateTo?: Date;
      page: number;
      limit: number;
    },
  ) {
    const where: Prisma.OrderWhereInput = { restaurantId };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.orderNumber) {
      where.orderNumber = filters.orderNumber;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      };
    }

    const skip = (filters.page - 1) * filters.limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_WITH_ITEMS,
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.limit,
      }),
    ]);

    return {
      data: data.map(serializeOrder),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async findBySessionId(sessionId: string, restaurantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { cashShiftId: sessionId, restaurantId },
      include: ORDER_WITH_ITEMS,
    });
    return orders.map(serializeOrder);
  }

  /**
   * Atomically transitions an order's status, but only if the row's current
   * status still matches `expectedStatus`. Returns the number of rows updated
   * (0 if another transaction changed the status first, 1 on success).
   *
   * This is the optimistic-concurrency primitive used by kitchen flows. Under
   * READ COMMITTED, `updateMany` implicitly acquires FOR NO KEY UPDATE on each
   * matching row for the duration of the surrounding transaction; concurrent
   * transactions that target the same row block, then re-evaluate their WHERE
   * clause against the post-commit state — yielding count = 0 if the status
   * has already advanced.
   *
   * Used by:
   *   - OrdersService.kitchenAdvanceStatus — prevents double-advance from
   *     multi-screen KDS, and prevents kitchen from overwriting a concurrent
   *     cashier cancellation. See audit finding H-13.
   *
   * @param tx              - active Prisma transaction client
   * @param id              - order UUID
   * @param restaurantId    - tenant guard (defense in depth)
   * @param expectedStatus  - the status the caller observed before deciding to
   *                          transition; the UPDATE is a no-op if the row has
   *                          since drifted away from this value
   * @param newStatus       - the status to transition to
   * @returns 1 if the transition committed, 0 if the status changed concurrently
   */
  async transitionStatusIfMatches(
    tx: Prisma.TransactionClient,
    id: string,
    restaurantId: string,
    expectedStatus: OrderStatus,
    newStatus: OrderStatus,
  ): Promise<number> {
    const result = await tx.order.updateMany({
      where: { id, restaurantId, status: expectedStatus },
      data: { status: newStatus },
    });
    return result.count;
  }

  /**
   * Variant of `transitionStatusIfMatches` for the markAsPaid flow.
   * Atomically transitions status, sets isPaid=true and paymentMethod, but
   * only if the row's status matches `expectedStatus` AND isPaid is currently
   * false. The latter guard makes the operation idempotent under concurrent
   * payment attempts.
   *
   * See audit finding H-05.
   *
   * @returns 1 if the transition committed, 0 if status drifted or already paid
   */
  async transitionStatusIfMatchesAndUnpaid(
    tx: Prisma.TransactionClient,
    id: string,
    restaurantId: string,
    expectedStatus: OrderStatus,
    newStatus: OrderStatus,
    paymentMethod: string | undefined,
  ): Promise<number> {
    const result = await tx.order.updateMany({
      where: { id, restaurantId, status: expectedStatus, isPaid: false },
      data: {
        status: newStatus,
        isPaid: true,
        paymentMethod: paymentMethod as PaymentMethod | undefined,
      },
    });
    return result.count;
  }

  /**
   * Companion to the unmarkAsPaid flow. Atomically clears isPaid only if the
   * row is currently paid; no-op if already unpaid (idempotent).
   *
   * See audit finding H-06.
   *
   * @returns 1 if cleared, 0 if already unpaid
   */
  async unmarkAsPaidIfPaid(
    tx: Prisma.TransactionClient,
    id: string,
    restaurantId: string,
  ): Promise<number> {
    const result = await tx.order.updateMany({
      where: { id, restaurantId, isPaid: true },
      data: { isPaid: false, paymentMethod: null },
    });
    return result.count;
  }
}
