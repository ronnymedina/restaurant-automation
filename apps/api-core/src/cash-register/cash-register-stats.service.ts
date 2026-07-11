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
  collected: bigint;
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
type StatusAccumulator = Record<string, { count: number }>;

@Injectable()
export class CashRegisterStatsService {
  constructor(private readonly orderShiftReport: OrderShiftReportRepository) {}

  async getSummary(restaurantId: string, sessionId: string): Promise<ShiftSummary> {
    const [groups, topProducts] = await Promise.all([
      this.orderShiftReport.groupOrdersByShift(restaurantId, sessionId),
      this.orderShiftReport.getTopProductsWithNamesByShift(restaurantId, sessionId),
    ]);

    const byStatus = this.groupByStatus(groups);
    const counts = this.buildCounts(byStatus);

    const orderTypeCounts = this.countOrdersBy(groups, (r) => r.orderType);
    const orderSourceCounts = this.countOrdersBy(groups, (r) => r.orderSource);

    return {
      counts,
      revenue: this.calculateRevenue(groups),
      byPaymentMethod: this.buildPaymentMethods(groups),
      byOrderType: Object.entries(orderTypeCounts).map(([type, count]) => ({ type, count })),
      byOrderSource: Object.entries(orderSourceCounts).map(([source, count]) => ({ source, count })),
      topProducts,
    };
  }

  /**
   * Collapses the multi-dimensional groupBy rows into a single map keyed by status,
   * accumulating order count per status across all payment method / type / source combinations.
   */
  private groupByStatus(groups: StatusGroup[]): StatusAccumulator {
    return groups.reduce<StatusAccumulator>((acc, row) => {
      const status = row.status as string;
      const prev = acc[status] ?? { count: 0 };
      acc[status] = {
        count: prev.count + row._count.id,
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
   * Calcula el dinero del turno con la regla única de "dinero entrante":
   * una orden cuenta como cobrada cuando `isPaid === true` y no está
   * cancelada — independiente de su status (el flujo de cobro en dos pasos
   * permite SERVED+isPaid, e incluso CREATED+isPaid con un sistema de pago).
   *
   * - collected: Σ totalAmount de órdenes pagadas no canceladas. El método de
   *   pago NO es señal de cobro (el cliente lo elige en el kiosk sin pagar);
   *   isPaid sí lo es.
   * - pending: Σ totalAmount de órdenes NO pagadas no canceladas (dinero
   *   comprometido pero aún sin cobrar).
   * - averageTicket: collected / cantidad de órdenes pagadas. Floor division
   *   en centavos (audit H-30): la pérdida es ≤ paidCount-1 centavos por turno;
   *   el serializer aplica fromCents y la UI muestra 2 decimales.
   *
   * La exclusión de CANCELLED es defensiva: R2-01 garantiza que no existe
   * CANCELLED+isPaid (para cancelar una orden pagada hay que sacarle el isPaid
   * primero). Al cierre, collected == cashShift.totalSales (toda COMPLETED es
   * isPaid y closeSession no deja cerrar con órdenes pendientes).
   */
  private calculateRevenue(groups: StatusGroup[]): ShiftRevenue {
    const isCounted = (r: StatusGroup) => r.status !== OrderStatus.CANCELLED;

    const paidRows = groups.filter((r) => r.isPaid && isCounted(r));
    const collected = paidRows.reduce((sum, r) => sum + (r._sum.totalAmount ?? 0n), 0n);
    const paidCount = paidRows.reduce((sum, r) => sum + r._count.id, 0);

    const pending = groups
      .filter((r) => !r.isPaid && isCounted(r))
      .reduce((sum, r) => sum + (r._sum.totalAmount ?? 0n), 0n);

    const averageTicket = paidCount > 0 ? collected / BigInt(paidCount) : 0n;

    return { collected, pending, averageTicket };
  }

  /**
   * Desglosa el dinero cobrado por método de pago. Incluye solo órdenes
   * pagadas (`isPaid`) no canceladas — misma regla que `collected`, de modo
   * que la suma de métodos cuadra con `revenue.collected` también en vivo.
   * Una orden con paymentMethod pero sin pagar (kiosk, o staff que lo asignó
   * antes del cobro) no representa dinero en caja y no se cuenta.
   */
  private buildPaymentMethods(groups: StatusGroup[]): ShiftStatsByPaymentMethod[] {
    const acc = groups
      .filter((row) => row.isPaid && row.status !== OrderStatus.CANCELLED && row.paymentMethod)
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
