import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from './exceptions/cash-register.exceptions';

export interface ShiftCounts {
  total: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
  pending: number;
}

export interface ShiftRevenue {
  completed: bigint;
  pending: bigint;
  averageTicket: bigint;
}

export interface ShiftTopProduct {
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}

export interface ShiftStats {
  counts: ShiftCounts;
  revenue: ShiftRevenue;
  byPaymentMethod: Array<{ method: string; count: number; total: bigint }>;
  byOrderType: Array<{ type: string; count: number }>;
  byOrderSource: Array<{ source: string; count: number }>;
  topProducts: ShiftTopProduct[];
}

export function emptyShiftStats(): ShiftStats {
  return {
    counts: {
      total: 0, created: 0, confirmed: 0, processing: 0,
      served: 0, completed: 0, cancelled: 0, pending: 0,
    },
    revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
  };
}

@Injectable()
export class CashRegisterStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashShiftRepository: CashShiftRepository,
  ) {}

  async getStats(sessionId: string, restaurantId: string): Promise<ShiftStats> {
    const session = await this.cashShiftRepository.findById(sessionId);
    if (!session || session.restaurantId !== restaurantId) {
      throw new CashRegisterNotFoundException(sessionId);
    }

    const [groups, topProductRows] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status', 'paymentMethod', 'orderType', 'orderSource'],
        where: { cashShiftId: sessionId },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { cashShiftId: sessionId, status: { not: OrderStatus.CANCELLED } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    const countsByStatus: Record<string, number> = {};
    const revenueByStatus: Record<string, bigint> = {};
    const paymentMethodMap: Record<string, { count: number; total: bigint }> = {};
    const orderTypeMap: Record<string, number> = {};
    const orderSourceMap: Record<string, number> = {};

    for (const row of groups) {
      const status = row.status as string;
      const count = row._count.id;
      const amount = row._sum.totalAmount ?? 0n;

      countsByStatus[status] = (countsByStatus[status] ?? 0) + count;
      revenueByStatus[status] = (revenueByStatus[status] ?? 0n) + amount;

      if (status === OrderStatus.COMPLETED && row.paymentMethod) {
        const method = row.paymentMethod as string;
        if (!paymentMethodMap[method]) {
          paymentMethodMap[method] = { count: 0, total: 0n };
        }
        paymentMethodMap[method].count += count;
        paymentMethodMap[method].total += amount;
      }

      const orderType = row.orderType ?? 'UNKNOWN';
      orderTypeMap[orderType] = (orderTypeMap[orderType] ?? 0) + count;

      const orderSource = row.orderSource ?? 'UNKNOWN';
      orderSourceMap[orderSource] = (orderSourceMap[orderSource] ?? 0) + count;
    }

    const completedCount = countsByStatus[OrderStatus.COMPLETED] ?? 0;
    const cancelledCount = countsByStatus[OrderStatus.CANCELLED] ?? 0;
    const totalCount = Object.values(countsByStatus).reduce((a, b) => a + b, 0);
    const completedRevenue = revenueByStatus[OrderStatus.COMPLETED] ?? 0n;

    let pendingRevenue = 0n;
    for (const [status, amount] of Object.entries(revenueByStatus)) {
      if (status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED) {
        pendingRevenue += amount;
      }
    }

    const averageTicket = completedCount > 0
      ? completedRevenue / BigInt(completedCount)
      : 0n;

    const productIds = topProductRows.map((r) => r.productId);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return {
      counts: {
        total: totalCount,
        created:    countsByStatus[OrderStatus.CREATED]    ?? 0,
        confirmed:  countsByStatus[OrderStatus.CONFIRMED]  ?? 0,
        processing: countsByStatus[OrderStatus.PROCESSING] ?? 0,
        served:     countsByStatus[OrderStatus.SERVED]     ?? 0,
        completed:  completedCount,
        cancelled:  cancelledCount,
        pending:    totalCount - completedCount - cancelledCount,
      },
      revenue: {
        completed: completedRevenue,
        pending:   pendingRevenue,
        averageTicket,
      },
      byPaymentMethod: Object.entries(paymentMethodMap).map(([method, val]) => ({
        method, count: val.count, total: val.total,
      })),
      byOrderType:   Object.entries(orderTypeMap).map(([type, count])     => ({ type, count })),
      byOrderSource: Object.entries(orderSourceMap).map(([source, count]) => ({ source, count })),
      topProducts: topProductRows.map((r) => ({
        id:       r.productId,
        name:     nameMap[r.productId] ?? 'Producto',
        quantity: r._sum.quantity ?? 0,
        total:    r._sum.subtotal ?? 0n,
      })),
    };
  }
}
