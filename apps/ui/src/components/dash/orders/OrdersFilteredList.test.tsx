import { render, screen } from '@testing-library/react';
import OrdersFilteredList from './OrdersFilteredList';
import type { Order } from './api';

const makeOrder = (i: number): Order => ({
  id: `order-${i}`,
  orderNumber: i + 1,
  cashShiftId: 'shift-1',
  status: 'CREATED',
  totalAmount: 100,
  isPaid: false,
  createdAt: '2026-05-14T10:00:00.000Z',
  items: [],
});

const noop = () => {};
const callbacks = {
  onAdvance: noop,
  onPay: noop,
  onCancel: noop,
  onReceipt: noop,
};

describe('OrdersFilteredList', () => {
  it('shows history link footer when orders.length === 100', () => {
    const orders = Array.from({ length: 100 }, (_, i) => makeOrder(i));
    render(
      <OrdersFilteredList
        orders={orders}
        filterLabel="CREATED"
        onClearFilter={noop}
        {...callbacks}
      />,
    );
    expect(screen.getByText(/ve al historial de pedidos/i)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dash/orders-history');
  });

  it('does not show footer when orders.length < 100', () => {
    const orders = Array.from({ length: 3 }, (_, i) => makeOrder(i));
    render(
      <OrdersFilteredList
        orders={orders}
        filterLabel="CREATED"
        onClearFilter={noop}
        {...callbacks}
      />,
    );
    expect(screen.queryByText(/ve al historial de pedidos/i)).not.toBeInTheDocument();
  });
});
