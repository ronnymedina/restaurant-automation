import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const ORDER_WITH_ITEMS = {
  items: {
    include: { product: true, menuItem: true },
  },
} as const;

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
    return client.order.create({
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
  }

  async findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: ORDER_WITH_ITEMS,
    });
  }

  async findByRestaurantId(restaurantId: string, status?: OrderStatus, statuses?: OrderStatus[]) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        ...(statuses?.length ? { status: { in: statuses } } : status ? { status } : {}),
      },
      include: ORDER_WITH_ITEMS,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: ORDER_WITH_ITEMS,
    });
  }

  async markAsPaid(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { isPaid: true },
      include: ORDER_WITH_ITEMS,
    });
  }

  async cancelOrder(id: string, reason: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
      include: ORDER_WITH_ITEMS,
    });
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
      data,
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
