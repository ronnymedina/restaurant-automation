import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { createRef } from 'react';
import OrderStatsPanel, { type OrderStatsPanelHandle } from './OrderStatsPanel';
import * as registerApi from '../register/api';

vi.mock('../register/api');

// OrderStatsPanel calls useRestaurantSettings which needs a QueryClientProvider
// in the tree. Mocking the hook (CL defaults) keeps the test isolated.
vi.mock('../../../lib/restaurant-settings', () => ({
  useRestaurantSettings: () => ({
    data: { decimalSeparator: ',', thousandsSeparator: '.' },
  }),
}));

const mockSummary = {
  counts: {
    total: 23, pending: 5, created: 2, confirmed: 1,
    processing: 1, served: 1, completed: 18, cancelled: 2,
  },
  revenue: { collected: 1240.00, pending: 180.00, averageTicket: 53.91 },
  byPaymentMethod: [],
  byOrderType: [],
  byOrderSource: [],
  topProducts: [
    { id: '1', name: 'Hamburguesa clásica', quantity: 8, total: 280 },
    { id: '2', name: 'Pizza pepperoni',    quantity: 6, total: 210 },
    { id: '3', name: 'Papas fritas',       quantity: 5, total: 75  },
    { id: '4', name: 'Refresco grande',    quantity: 4, total: 40  },
    { id: '5', name: 'Limonada natural',   quantity: 3, total: 45  },
  ],
};

beforeEach(() => {
  vi.mocked(registerApi.getLiveStats).mockResolvedValue({
    ok: true,
    data: { summary: mockSummary },
  });
});

afterEach(() => vi.clearAllMocks());

test('shows loading skeleton while fetching', () => {
  vi.mocked(registerApi.getLiveStats).mockReturnValue(new Promise(() => {}));
  render(<OrderStatsPanel />);
  // Skeleton: 4 tile placeholders + bar placeholders; no revenue values shown
  expect(screen.queryByText('$1.240,00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
});

test('renders KPI tiles after successful fetch', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('$1.240,00')).toBeInTheDocument());
  expect(screen.getByText('$180,00')).toBeInTheDocument();
  expect(screen.getByText('23')).toBeInTheDocument();
  expect(screen.getByText('$53,91')).toBeInTheDocument();
});

test('renders top products bar chart after fetch', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('Hamburguesa clásica')).toBeInTheDocument());
  expect(screen.getByText('Pizza pepperoni')).toBeInTheDocument();
  expect(screen.getByText('8 uds.')).toBeInTheDocument();
  expect(screen.getByText('6 uds.')).toBeInTheDocument();
});

test('refresh button triggers a new fetch', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('$1.240,00')).toBeInTheDocument());

  expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));

  await waitFor(() =>
    expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(2),
  );
});

test('on fetch failure, shows error without clearing existing data', async () => {
  render(<OrderStatsPanel />);
  await waitFor(() => expect(screen.getByText('$1.240,00')).toBeInTheDocument());

  vi.mocked(registerApi.getLiveStats).mockResolvedValueOnce({
    ok: false,
    error: {},
    httpStatus: 500,
  });
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));

  await waitFor(() =>
    expect(screen.getByText('No se pudo actualizar')).toBeInTheDocument(),
  );
  // Previous data still visible
  expect(screen.getByText('$1.240,00')).toBeInTheDocument();
});

test('ref.refresh() triggers a new getLiveStats call', async () => {
  const ref = createRef<OrderStatsPanelHandle>();
  render(<OrderStatsPanel ref={ref} />);
  await waitFor(() => expect(screen.getByText('$1.240,00')).toBeInTheDocument());

  expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(1);
  ref.current!.refresh();

  await waitFor(() =>
    expect(vi.mocked(registerApi.getLiveStats)).toHaveBeenCalledTimes(2),
  );
});
