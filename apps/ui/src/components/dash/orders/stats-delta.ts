// apps/ui/src/components/dash/orders/stats-delta.ts
//
// Incremento local de las stats del turno a partir de eventos SSE (R2-05).
// Los predicados de `mutate` replican EXACTAMENTE cash-register-stats.service.ts
// del backend (buildCounts + calculateRevenue), de modo que el incremento en vivo
// coincide con el refetch autoritativo del botón (salvo drift de float en pesos,
// reconciliado al refrescar).

import type { ShiftSummary, ShiftCounts } from '../register/api';

export interface LiveSummary extends ShiftSummary {
  // Divisor de averageTicket. No lo expone el endpoint; se deriva al ingerir
  // un summary autoritativo (ver fromSummary) y se mantiene por delta.
  paidCount: number;
}

export type OrderLike = {
  status: string;
  isPaid: boolean;
  totalAmount: number;
};

const STATUS_TO_COUNT_KEY: Record<string, keyof ShiftCounts> = {
  CREATED: 'created',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SERVED: 'served',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * Convierte un summary autoritativo del endpoint en LiveSummary.
 * paidCount = Σ count de byPaymentMethod (misma regla que `collected`:
 * isPaid && status != CANCELLED && paymentMethod presente — buildPaymentMethods backend).
 */
export function fromSummary(summary: ShiftSummary): LiveSummary {
  const paidCount = summary.byPaymentMethod.reduce((sum, m) => sum + m.count, 0);
  return { ...structuredClone(summary), paidCount };
}

/** Aplica (+1) o quita (-1) la contribución de una orden al summary, in place. */
function mutate(summary: LiveSummary, order: OrderLike, sign: 1 | -1): void {
  const status = order.status;

  summary.counts.total += sign;

  const key = STATUS_TO_COUNT_KEY[status];
  if (key) summary.counts[key] += sign;

  // pending (count) = total - completed - cancelled
  if (status !== 'COMPLETED' && status !== 'CANCELLED') {
    summary.counts.pending += sign;
  }

  const counted = status !== 'CANCELLED';
  if (counted && order.isPaid) {
    summary.revenue.collected += sign * order.totalAmount;
    summary.paidCount += sign;
  } else if (counted && !order.isPaid) {
    summary.revenue.pending += sign * order.totalAmount;
  }
}

/**
 * Núcleo del incremento: resta la contribución de la orden vieja y suma la nueva.
 * - order:new      → applyOrderEvent(summary, null, payload)
 * - order:updated  → applyOrderEvent(summary, oldOrder, { ...oldOrder, ...payload })
 * No muta el summary de entrada.
 *
 * NOTA: sólo `counts` y `revenue` se mantienen de forma incremental.
 * `byPaymentMethod`, `byOrderType`, `byOrderSource` y `topProducts` se heredan
 * sin cambios del último `fromSummary` autoritativo y sólo se actualizan al refrescar.
 */
export function applyOrderEvent(
  summary: LiveSummary,
  oldOrder: OrderLike | null,
  newOrder: OrderLike | null,
): LiveSummary {
  const next = structuredClone(summary);
  if (oldOrder) mutate(next, oldOrder, -1);
  if (newOrder) mutate(next, newOrder, 1);
  next.revenue.averageTicket =
    next.paidCount > 0 ? next.revenue.collected / next.paidCount : 0;
  return next;
}
