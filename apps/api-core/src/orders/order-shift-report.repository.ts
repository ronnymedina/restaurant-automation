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

  groupOrdersByShift(sessionId: string): Promise<OrderGroupRow[]> {
    return this.prisma.order.groupBy({
      by: [status, paymentMethod, orderType, orderSource],
      where: { cashShiftId: sessionId },
      _sum: { totalAmount: true },
      _count: { id: true },
    }) as unknown as Promise<OrderGroupRow[]>;
  }

  async getTopProductsWithNamesByShift(sessionId: string, take = 5): Promise<TopProductWithName[]> {
    const rows = await this.prisma.orderItem.groupBy({
      by: [productId],
      where: { order: { cashShiftId: sessionId, status: { not: OrderStatus.CANCELLED } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    }) as unknown as TopProductRow[];

    if (rows.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, name: true },
    });

    
    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return rows.map((r) => ({
      id: r.productId,
      name: nameMap[r.productId] ?? 'Producto',
      quantity: r._sum.quantity ?? 0,
      total: r._sum.subtotal ?? 0n,
    }));
  }
}
