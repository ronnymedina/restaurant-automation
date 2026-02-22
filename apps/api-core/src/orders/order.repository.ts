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
  registerSessionId: string;
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
  constructor(private readonly prisma: PrismaService) {}

  async createWithItems(data: CreateOrderData, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.order.create({
      data: {
        orderNumber: data.orderNumber,
        totalAmount: data.totalAmount,
        restaurantId: data.restaurantId,
        registerSessionId: data.registerSessionId,
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

  async findByRestaurantId(restaurantId: string, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        ...(status ? { status } : {}),
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

  async findBySessionId(sessionId: string) {
    return this.prisma.order.findMany({
      where: { registerSessionId: sessionId },
      include: ORDER_WITH_ITEMS,
    });
  }
}
