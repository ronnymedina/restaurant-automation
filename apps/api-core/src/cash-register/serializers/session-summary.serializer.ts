import { fromCents } from '../../common/helpers/money';

export interface PaymentBreakdownItem {
  method: string;
  count: number;
  total: number;
}

function serializePaymentBreakdown(
  breakdown: Record<string, { count: number; total: bigint }>,
): PaymentBreakdownItem[] {
  return Object.entries(breakdown).map(([method, val]) => ({
    method,
    count: val.count,
    total: fromCents(val.total),
  }));
}

export function serializeSessionSummary(summary: {
  completed: { count: number; total: bigint };
  cancelled: { count: number };
  paymentBreakdown: Record<string, { count: number; total: bigint }>;
}) {
  return {
    completed: { count: summary.completed.count, total: fromCents(summary.completed.total) },
    cancelled: { count: summary.cancelled.count },
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
