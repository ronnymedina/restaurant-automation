import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { OrderShiftReportRepository, TopProductWithName } from '../orders/order-shift-report.repository';

// -- Types --

export interface ShiftCounts {
  total: number;
  pending: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
}

export interface ShiftRevenue {
  completed: bigint;
  pending: bigint;
  averageTicket: bigint;
}

export interface ShiftStatsByPaymentMethod {
  method: string;
  count: number;
  total: bigint;
}

export interface ShiftSummary {
  counts: ShiftCounts;
  revenue: ShiftRevenue;
  byPaymentMethod: Array<ShiftStatsByPaymentMethod>;
  byOrderType: Array<{ type: string; count: number }>;
  byOrderSource: Array<{ source: string; count: number }>;
  topProducts: TopProductWithName[];
}

type StatusGroup = Awaited<ReturnType<OrderShiftReportRepository['groupOrdersByShift']>>[number];
type StatusAccumulator = Record<string, { count: number; revenue: bigint }>;

@Injectable()
export class CashRegisterStatsService {
  constructor(private readonly orderShiftReport: OrderShiftReportRepository) {}

  async getSummary(sessionId: string): Promise<ShiftSummary> {
    const [groups, topProducts] = await Promise.all([
      this.orderShiftReport.groupOrdersByShift(sessionId),
      this.orderShiftReport.getTopProductsWithNamesByShift(sessionId),
    ]);

    const byStatus = this.groupByStatus(groups);
    const counts = this.buildCounts(byStatus);

    const orderTypeCounts = this.countOrdersBy(groups, (r) => r.orderType);
    const orderSourceCounts = this.countOrdersBy(groups, (r) => r.orderSource);

    return {
      counts,
      revenue: this.calculateRevenue(byStatus),
      byPaymentMethod: this.buildPaymentMethods(groups),
      byOrderType: Object.entries(orderTypeCounts).map(([type, count]) => ({ type, count })),
      byOrderSource: Object.entries(orderSourceCounts).map(([source, count]) => ({ source, count })),
      topProducts,
    };
  }

  /**
   * Collapses the multi-dimensional groupBy rows into a single map keyed by status,
   * accumulating order count and revenue per status across all payment method / type / source combinations.
   */
  private groupByStatus(groups: StatusGroup[]): StatusAccumulator {
    return groups.reduce<StatusAccumulator>((acc, row) => {
      const status = row.status as string;
      const prev = acc[status] ?? { count: 0, revenue: 0n };
      acc[status] = {
        count: prev.count + row._count.id,
        revenue: prev.revenue + (row._sum.totalAmount ?? 0n),
      };
      return acc;
    }, {});
  }

  /**
   * Builds the counts object with one key per OrderStatus + total + pending.
   * `pending` = total - completed - cancelled (CREATED, CONFIRMED, PROCESSING, SERVED).
   */
  private buildCounts(byStatus: StatusAccumulator): ShiftCounts {
    const get = (s: OrderStatus) => byStatus[s]?.count ?? 0;
    const created    = get(OrderStatus.CREATED);
    const confirmed  = get(OrderStatus.CONFIRMED);
    const processing = get(OrderStatus.PROCESSING);
    const served     = get(OrderStatus.SERVED);
    const completed  = get(OrderStatus.COMPLETED);
    const cancelled  = get(OrderStatus.CANCELLED);
    const total      = created + confirmed + processing + served + completed + cancelled;
    const pending    = total - completed - cancelled;
    return { total, pending, created, confirmed, processing, served, completed, cancelled };
  }

  /**
   * Answers three key shift revenue questions:
   * - How much money entered the register? → completed (COMPLETED orders only)
   * - How much money is committed but not yet collected? → pending (active orders; excludes CANCELLED since those will never be collected)
   * - How much does the average paying customer spend? → averageTicket (completed revenue / number of completed orders)
   */
  private calculateRevenue(byStatus: StatusAccumulator): ShiftRevenue {
    const completed = byStatus[OrderStatus.COMPLETED];
    const completedRevenue = completed?.revenue ?? 0n;
    const completedCount = completed?.count ?? 0;

    const pendingRevenue = Object.entries(byStatus)
      .filter(([status]) => status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED)
      .reduce((sum, [, { revenue }]) => sum + revenue, 0n);

    const averageTicket = completedCount > 0
      ? completedRevenue / BigInt(completedCount)
      : 0n;

    return { completed: completedRevenue, pending: pendingRevenue, averageTicket };
  }

  /**
   * Shows how customers are paying and how much real money came in per payment method.
   * Only includes COMPLETED orders because they are the only ones that represent money actually collected —
   * a cancelled order with a paymentMethod assigned never touched the register.
   */
  private buildPaymentMethods(groups: StatusGroup[]): ShiftStatsByPaymentMethod[] {
    const acc = groups
      .filter((row) => row.status === OrderStatus.COMPLETED && row.paymentMethod)
      .reduce<Record<string, { count: number; total: bigint }>>((obj, row) => {
        const method = row.paymentMethod as string;
        const prev = obj[method] ?? { count: 0, total: 0n };
        obj[method] = {
          count: prev.count + row._count.id,
          total: prev.total + (row._sum.totalAmount ?? 0n),
        };
        return obj;
      }, {});

    return Object.entries(acc).map(([method, { count, total }]) => ({ method, count, total }));
  }

  /**
   * Generic counter that groups orders by an arbitrary dimension (order type, source, etc.)
   * across all statuses, including CANCELLED — the intent of each order matters regardless of outcome.
   */
  private countOrdersBy(
    groups: StatusGroup[],
    getKey: (row: StatusGroup) => string | null | undefined,
  ): Record<string, number> {
    return groups.reduce<Record<string, number>>((acc, row) => {
      const key = getKey(row) ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + row._count.id;
      return acc;
    }, {});
  }
}
