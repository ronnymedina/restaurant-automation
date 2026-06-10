import { describe, test, expect } from 'vitest';
import { applyOrderEvent, fromSummary, type LiveSummary } from './stats-delta';
import type { ShiftSummary } from '../register/api';

function baseline(over: Partial<LiveSummary> = {}): LiveSummary {
  return {
    counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
    revenue: { collected: 0, pending: 0, averageTicket: 0 },
    byPaymentMethod: [], byOrderType: [], byOrderSource: [], topProducts: [],
    paidCount: 0,
    ...over,
  };
}

describe('applyOrderEvent', () => {
  test('order:new (CREATED, unpaid) suma total/created/pending y revenue.pending', () => {
    const s = applyOrderEvent(baseline(), null, { status: 'CREATED', isPaid: false, totalAmount: 100 });
    expect(s.counts.total).toBe(1);
    expect(s.counts.created).toBe(1);
    expect(s.counts.pending).toBe(1);
    expect(s.revenue.pending).toBe(100);
    expect(s.revenue.collected).toBe(0);
  });

  test('cobro SERVED false→true mueve pending→collected, no toca counts', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'SERVED', isPaid: false, totalAmount: 100 });
    s = applyOrderEvent(s, { status: 'SERVED', isPaid: false, totalAmount: 100 }, { status: 'SERVED', isPaid: true, totalAmount: 100 });
    expect(s.revenue.collected).toBe(100);
    expect(s.revenue.pending).toBe(0);
    expect(s.paidCount).toBe(1);
    expect(s.revenue.averageTicket).toBe(100);
    expect(s.counts.served).toBe(1);
    expect(s.counts.pending).toBe(1);
    expect(s.counts.total).toBe(1);
  });

  test('cancelación SERVED unpaid → CANCELLED quita pending revenue y mueve counts', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'SERVED', isPaid: false, totalAmount: 100 });
    s = applyOrderEvent(s, { status: 'SERVED', isPaid: false, totalAmount: 100 }, { status: 'CANCELLED', isPaid: false, totalAmount: 100 });
    expect(s.revenue.pending).toBe(0);
    expect(s.counts.served).toBe(0);
    expect(s.counts.pending).toBe(0);
    expect(s.counts.cancelled).toBe(1);
    expect(s.counts.total).toBe(1);
  });

  test('completar SERVED paid → COMPLETED mueve counts, revenue intacto', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'SERVED', isPaid: true, totalAmount: 100 });
    s = applyOrderEvent(s, { status: 'SERVED', isPaid: true, totalAmount: 100 }, { status: 'COMPLETED', isPaid: true, totalAmount: 100 });
    expect(s.counts.served).toBe(0);
    expect(s.counts.completed).toBe(1);
    expect(s.counts.pending).toBe(0);
    expect(s.revenue.collected).toBe(100);
    expect(s.paidCount).toBe(1);
  });

  test('averageTicket = collected / paidCount con dos órdenes pagadas', () => {
    let s = applyOrderEvent(baseline(), null, { status: 'COMPLETED', isPaid: true, totalAmount: 100 });
    s = applyOrderEvent(s, null, { status: 'COMPLETED', isPaid: true, totalAmount: 50 });
    expect(s.revenue.collected).toBe(150);
    expect(s.paidCount).toBe(2);
    expect(s.revenue.averageTicket).toBe(75);
  });

  test('no muta el summary de entrada (pureza)', () => {
    const input = baseline();
    applyOrderEvent(input, null, { status: 'CREATED', isPaid: false, totalAmount: 100 });
    expect(input.counts.total).toBe(0);
    expect(input.revenue.pending).toBe(0);
  });
});

describe('fromSummary', () => {
  test('deriva paidCount como Σ count de byPaymentMethod', () => {
    const summary: ShiftSummary = {
      counts: { total: 3, pending: 1, created: 0, confirmed: 0, processing: 0, served: 1, completed: 2, cancelled: 0 },
      revenue: { collected: 300, pending: 50, averageTicket: 150 },
      byPaymentMethod: [{ method: 'CASH', count: 1, total: 100 }, { method: 'CARD', count: 1, total: 200 }],
      byOrderType: [], byOrderSource: [], topProducts: [],
    };
    const live = fromSummary(summary);
    expect(live.paidCount).toBe(2);
    expect(live.revenue.collected).toBe(300);
  });
});
