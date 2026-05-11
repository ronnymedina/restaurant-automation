import { fromCents } from '../../common/helpers/money';
import { OrderStatus } from '@prisma/client';

export interface OrderStatusGroup {
  count: number;
  total: number;
}

function serializeStatusGroups(
  ordersByStatus: Record<string, { count: number; total: bigint }>,
): Record<OrderStatus, OrderStatusGroup> {
  const result = {} as Record<OrderStatus, OrderStatusGroup>;
  for (const status of Object.values(OrderStatus)) {
    const g = ordersByStatus[status] ?? { count: 0, total: 0n };
    result[status] = { count: g.count, total: fromCents(g.total) };
  }
  return result;
}

function serializePaymentBreakdown(
  breakdown: Record<string, { count: number; total: bigint }>,
): Record<string, { count: number; total: number }> {
  const result: Record<string, { count: number; total: number }> = {};
  for (const [method, val] of Object.entries(breakdown)) {
    result[method] = { count: val.count, total: fromCents(val.total) };
  }
  return result;
}

export function serializeSessionSummary(summary: {
  ordersByStatus: Record<string, { count: number; total: bigint }>;
  totalSales: bigint;
  totalOrders: number;
  paymentBreakdown: Record<string, { count: number; total: bigint }>;
}) {
  return {
    ordersByStatus: serializeStatusGroups(summary.ordersByStatus),
    totalSales: fromCents(summary.totalSales),
    totalOrders: summary.totalOrders,
    paymentBreakdown: serializePaymentBreakdown(summary.paymentBreakdown),
  };
}

export function serializeTopProducts(topProducts: Array<{
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}>) {
  return topProducts.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    total: fromCents(p.total),
  }));
}
