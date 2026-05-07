import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const ORDER_WITH_ITEMS = {
  items: {
    include: { product: true, menuItem: true },
  },
} as const;

/** Convert BigInt monetary fields to numbers so JSON serialization works. */
function serializeOrder<T extends Record<string, any>>(order: T): T {
  const result: Record<string, any> = { ...order };

  if (typeof result['totalAmount'] === 'bigint') {
    result['totalAmount'] = Number(result['totalAmount']);
  }

  if (Array.isArray(result['items'])) {
    result['items'] = result['items'].map((item: Record<string, any>) => {
      const si: Record<string, any> = { ...item };
      if (typeof si['unitPrice'] === 'bigint') si['unitPrice'] = Number(si['unitPrice']);
      if (typeof si['subtotal'] === 'bigint') si['subtotal'] = Number(si['subtotal']);
      if (si['product'] && typeof si['product']['price'] === 'bigint') {
        si['product'] = { ...si['product'], price: Number(si['product']['price']) };
      }
      if (si['menuItem'] && typeof si['menuItem']['priceOverride'] === 'bigint') {
        si['menuItem'] = { ...si['menuItem'], priceOverride: Number(si['menuItem']['priceOverride']) };
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

  async findByRestaurantId(restaurantId: string, status?: OrderStatus, statuses?: OrderStatus[], limit?: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        ...(statuses?.length ? { status: { in: statuses } } : status ? { status } : {}),
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

  async markAsPaid(id: string) {
    const order = await this.prisma.order.update({
      where: { id },
      data: { isPaid: true },
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
    return this.prisma.order.findMany({
      where: { cashShiftId: sessionId, restaurantId },
      include: ORDER_WITH_ITEMS,
    });
  }
}
