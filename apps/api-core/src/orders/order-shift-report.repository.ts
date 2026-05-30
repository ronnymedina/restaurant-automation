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

  async groupOrdersByShift(restaurantId: string, sessionId: string): Promise<OrderGroupRow[]> {
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
    // Prisma's orderItem.groupBy return type does not structurally match TopProductRow
    // (Prisma's inferred result type uses Decimal/branded literal-keyed selections),
    // so a single-step `as TopProductRow[]` cast fails. Keep `as unknown as` for this
    // one site — H-23 targets the OrderGroupRow cast above which is now a single cast.
    const rows = (await this.prisma.orderItem.groupBy({
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
    })) as unknown as TopProductRow[];

    if (rows.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) }, restaurantId },
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
