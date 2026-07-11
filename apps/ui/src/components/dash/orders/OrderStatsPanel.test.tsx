import { render, screen, fireEvent } from '@testing-library/react';
import { vi, afterEach, test, expect } from 'vitest';
import OrderStatsPanel from './OrderStatsPanel';
import type { ShiftSummary } from '../register/api';

// useRestaurantSettings necesita QueryClientProvider; lo mockeamos (defaults CL).
vi.mock('../../../lib/restaurant-settings', () => ({
  useRestaurantSettings: () => ({ data: { decimalSeparator: ',', thousandsSeparator: '.' } }),
}));

const summary: ShiftSummary = {
  counts: { total: 23, pending: 5, created: 2, confirmed: 1, processing: 1, served: 1, completed: 18, cancelled: 2 },
  revenue: { collected: 1240.0, pending: 180.0, averageTicket: 53.91 },
  byPaymentMethod: [],
  byOrderType: [],
  byOrderSource: [],
  topProducts: [
    { id: '1', name: 'Hamburguesa clásica', quantity: 8, total: 280 },
    { id: '2', name: 'Pizza pepperoni', quantity: 6, total: 210 },
  ],
};

const noop = () => {};

afterEach(() => vi.clearAllMocks());

test('renders KPI tiles from the summary prop', () => {
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={new Date()} error={null} onRefresh={noop} />);
  expect(screen.getByText('$1.240,00')).toBeInTheDocument();
  expect(screen.getByText('$180,00')).toBeInTheDocument();
  expect(screen.getByText('23')).toBeInTheDocument();
  expect(screen.getByText('$53,91')).toBeInTheDocument();
});

test('renders top products from the summary prop', () => {
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={null} error={null} onRefresh={noop} />);
  expect(screen.getByText('Hamburguesa clásica')).toBeInTheDocument();
  expect(screen.getByText('8 uds.')).toBeInTheDocument();
});

test('loading shows skeleton and disables the button', () => {
  render(<OrderStatsPanel summary={null} loading={true} lastUpdated={null} error={null} onRefresh={noop} />);
  expect(screen.queryByText('$1.240,00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
});

test('error prop renders the error message', () => {
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={null} error={'No se pudo actualizar'} onRefresh={noop} />);
  expect(screen.getByText('No se pudo actualizar')).toBeInTheDocument();
});

test('clicking the button calls onRefresh', () => {
  const onRefresh = vi.fn();
  render(<OrderStatsPanel summary={summary} loading={false} lastUpdated={null} error={null} onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
