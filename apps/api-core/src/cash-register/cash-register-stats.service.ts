import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { OrderShiftReportRepository } from '../orders/order-shift-report.repository';

// -- Types --

export interface ShiftCount {
  status: string;
  total: number;
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
  total: number;
  pending: number;
  counts: ShiftCount[];
  revenue: ShiftRevenue;
  byPaymentMethod: Array<{ method: string; count: number; total: bigint }>;
  byOrderType: Array<{ type: string; count: number }>;
  byOrderSource: Array<{ source: string; count: number }>;
  topProducts: ShiftTopProduct[];
}

export function emptyShiftStats(): ShiftStats {
  return {
    total: 0,
    pending: 0,
    counts: [],
    revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
  };
}

// -- Aggregation helpers --

type StatusGroup = Awaited<ReturnType<OrderShiftReportRepository['groupOrdersByShift']>>[number];

function groupByStatus(
  groups: StatusGroup[],
): Map<string, { count: number; revenue: bigint }> {
  return groups.reduce((map, row) => {
    const status = row.status as string;
    const prev = map.get(status) ?? { count: 0, revenue: 0n };
    return map.set(status, {
      count: prev.count + row._count.id,
      revenue: prev.revenue + (row._sum.totalAmount ?? 0n),
    });
  }, new Map<string, { count: number; revenue: bigint }>());
}

function calculateRevenue(
  byStatus: Map<string, { count: number; revenue: bigint }>,
): ShiftRevenue {
  const completed = byStatus.get(OrderStatus.COMPLETED);
  const completedRevenue = completed?.revenue ?? 0n;
  const completedCount = completed?.count ?? 0;

  const pendingRevenue = Array.from(byStatus.entries())
    .filter(([status]) => status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED)
    .reduce((sum, [, { revenue }]) => sum + revenue, 0n);

  const averageTicket = completedCount > 0
    ? completedRevenue / BigInt(completedCount)
    : 0n;

  return { completed: completedRevenue, pending: pendingRevenue, averageTicket };
}

function buildPaymentMethods(groups: StatusGroup[]): ShiftStats['byPaymentMethod'] {
  const methodMap = groups
    .filter((row) => row.status === OrderStatus.COMPLETED && row.paymentMethod)
    .reduce((map, row) => {
      const method = row.paymentMethod as string;
      const prev = map.get(method) ?? { count: 0, total: 0n };
      return map.set(method, {
        count: prev.count + row._count.id,
        total: prev.total + (row._sum.totalAmount ?? 0n),
      });
    }, new Map<string, { count: number; total: bigint }>());

  return Array.from(methodMap.entries()).map(([method, { count, total }]) => ({ method, count, total }));
}

function buildDimensionCounts(
  groups: StatusGroup[],
  getKey: (row: StatusGroup) => string | null | undefined,
): Map<string, number> {
  return groups.reduce((map, row) => {
    const key = getKey(row) ?? 'UNKNOWN';
    return map.set(key, (map.get(key) ?? 0) + row._count.id);
  }, new Map<string, number>());
}

// -- Service --

@Injectable()
export class CashRegisterStatsService {
  constructor(private readonly orderShiftReport: OrderShiftReportRepository) {}

  async getStats(sessionId: string): Promise<ShiftStats> {
    const [groups, topProductRows] = await Promise.all([
      this.orderShiftReport.groupOrdersByShift(sessionId),
      this.orderShiftReport.getTopProductsByShift(sessionId),
    ]);

    const byStatus = groupByStatus(groups);
    const counts = Array.from(byStatus.entries()).map(([status, { count }]) => ({ status, total: count }));
    const total = counts.reduce((sum, c) => sum + c.total, 0);
    const pending = total
      - (byStatus.get(OrderStatus.COMPLETED)?.count ?? 0)
      - (byStatus.get(OrderStatus.CANCELLED)?.count ?? 0);

    const productIds = topProductRows.map((r) => r.productId);
    const products = productIds.length > 0
      ? await this.orderShiftReport.getProductNamesByIds(productIds)
      : [];
    const nameMap = new Map(products.map((p) => [p.id, p.name]));

    const orderTypeCounts = buildDimensionCounts(groups, (r) => r.orderType);
    const orderSourceCounts = buildDimensionCounts(groups, (r) => r.orderSource);

    return {
      total,
      pending,
      counts,
      revenue: calculateRevenue(byStatus),
      byPaymentMethod: buildPaymentMethods(groups),
      byOrderType: Array.from(orderTypeCounts.entries()).map(([type, count]) => ({ type, count })),
      byOrderSource: Array.from(orderSourceCounts.entries()).map(([source, count]) => ({ source, count })),
      topProducts: topProductRows.map((r) => ({
        id: r.productId,
        name: nameMap.get(r.productId) ?? 'Producto',
        quantity: r._sum.quantity ?? 0,
        total: r._sum.subtotal ?? 0n,
      })),
    };
  }
}
