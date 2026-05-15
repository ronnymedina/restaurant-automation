import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrdersPanel from './OrdersPanel';

vi.mock('./api', () => ({
  getCurrentSession: vi.fn(),
  getOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  markOrderPaid: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({ getAccessToken: vi.fn(() => null) }));
vi.mock('../../../config', () => ({ config: { apiUrl: 'http://localhost:3000' } }));

import { getCurrentSession, getOrders } from './api';
const mockGetCurrentSession = vi.mocked(getCurrentSession);
const mockGetOrders = vi.mocked(getOrders);

afterEach(() => vi.clearAllMocks());

test('shows loading state initially', () => {
  mockGetCurrentSession.mockReturnValue(new Promise(() => {}));
  render(<OrdersPanel />);
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('shows closed message when no session is active', async () => {
  mockGetCurrentSession.mockResolvedValue({ ok: true, data: null });
  render(<OrdersPanel />);
  await waitFor(() =>
    expect(screen.getByText(/La caja está cerrada/)).toBeInTheDocument(),
  );
});

test('shows error state on API failure', async () => {
  mockGetCurrentSession.mockResolvedValue({ ok: false, error: {}, httpStatus: 403 });
  render(<OrdersPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar')).toBeInTheDocument(),
  );
});

test('shows error state on network exception', async () => {
  mockGetCurrentSession.mockRejectedValue(new Error('Network error'));
  render(<OrdersPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar')).toBeInTheDocument(),
  );
});

test('when session is open, fetches active orders with statuses and limit=100', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(mockGetOrders).toHaveBeenCalledWith({
      statuses: ['CREATED', 'PROCESSING'],
      limit: 100,
    }),
  );
});

test('when filter is applied with statuses, fetches orders with filter statuses', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  // Wait for initial load
  await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(1));

  // Open the filter panel
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));

  // Select the COMPLETED status checkbox
  fireEvent.click(screen.getByRole('checkbox', { name: 'Completado' }));

  // Apply the filter
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

  await waitFor(() =>
    expect(mockGetOrders).toHaveBeenLastCalledWith({
      statuses: ['COMPLETED'],
      limit: 100,
    }),
  );
});

test('when session is open, shows session banner with máx 100 note', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(screen.getByText('máx. 100 pedidos')).toBeInTheDocument(),
  );
});
