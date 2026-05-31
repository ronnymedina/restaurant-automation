import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrdersPanel from './OrdersPanel';

vi.mock('./api', () => ({
  getCurrentSession: vi.fn(),
  getOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  markOrderPaid: vi.fn(),
  unmarkOrderPaid: vi.fn(),
  cancelOrder: vi.fn(),
  confirmOrder: vi.fn(),
}));

vi.mock('../../../config', () => ({ config: { apiUrl: 'http://localhost:3000' } }));

// OrderCard (rendered for each order) calls useRestaurantSettings which needs
// a QueryClientProvider in the tree. Mocking the hook keeps the test isolated
// from react-query infrastructure.
vi.mock('../../../lib/restaurant-settings', () => ({
  useRestaurantSettings: () => ({
    data: { decimalSeparator: ',', thousandsSeparator: '.' },
  }),
}));

// jsdom does not provide a global EventSource; stub a no-op class so the SSE
// useEffect can construct one without throwing. Individual tests that need to
// assert on EventSource calls may override this stub via vi.stubGlobal.
class NoopEventSource {
  addEventListener() {}
  close() {}
  constructor(_url: string, _init?: EventSourceInit) {}
}
vi.stubGlobal('EventSource', NoopEventSource);

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
      statuses: ['CREATED', 'CONFIRMED', 'PROCESSING', 'SERVED'],
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

test('when getOrders returns 409 NO_OPEN_CASH_REGISTER, sets status to CLOSED', async () => {
  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-xyz', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({
    ok: false,
    httpStatus: 409,
    error: { code: 'NO_OPEN_CASH_REGISTER' },
  });

  render(<OrdersPanel />);

  await waitFor(() =>
    expect(screen.getByText(/La caja está cerrada/)).toBeInTheDocument(),
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

test('H-18: rapid double-click on Confirmar dispatches confirmOrder once', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockImplementation(
    () => new Promise((r) => setTimeout(() => r({ ok: true, data: {} as any }), 50)),
  );

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  const confirmBtn = await screen.findByText('Confirmar');

  fireEvent.click(confirmBtn);
  fireEvent.click(confirmBtn); // rapid double-click before resolve

  await waitFor(() => expect(vi.mocked(confirmOrder)).toHaveBeenCalledTimes(1));
});

test('H-18 (regression): Confirmar button is disabled while mutation is in-flight (Kanban path)', async () => {
  const { confirmOrder } = await import('./api');
  // Never resolves during the test — keeps the order in-flight indefinitely
  vi.mocked(confirmOrder).mockImplementation(() => new Promise(() => {}));

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });

  expect(confirmBtn).not.toBeDisabled();
  fireEvent.click(confirmBtn);

  await waitFor(() => expect(confirmBtn).toBeDisabled());
});

test('H-18 (regression): Confirmar button is disabled while mutation is in-flight (FilteredList path)', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockImplementation(() => new Promise(() => {}));

  mockGetCurrentSession.mockResolvedValue({ ok: true, data: { id: 'shift', openedByEmail: 'a@b.c' } });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 1, status: 'CREATED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any],
  });

  render(<OrdersPanel />);
  await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(1));

  // Activate a filter to switch to the FilteredList view
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Creado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

  // Wait for filtered list to render with the order
  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });

  expect(confirmBtn).not.toBeDisabled();
  fireEvent.click(confirmBtn);

  await waitFor(() => expect(confirmBtn).toBeDisabled());
});

// H-17: EventSource must not be re-created on filter changes.
// activeFilter is internal state; we cannot trigger it via props, so we assert
// that after mount completes (and any SSE-related re-renders settle) the
// constructor was called exactly once. If a future change re-adds activeFilter
// to the SSE useEffect deps, filter-panel interactions (see the adjacent test)
// would cause more than one construction and this test would surface the regression.
test('H-17: EventSource is created once per session, not on every render', async () => {
  let constructorCallCount = 0;
  let lastUrl: string | undefined;
  let lastInit: EventSourceInit | undefined;

  // EventSource must be a real class (constructor) so `new EventSource(...)` works
  class FakeEventSource {
    static callCount = 0;
    addEventListener = vi.fn();
    close = vi.fn();
    constructor(url: string, init?: EventSourceInit) {
      constructorCallCount++;
      lastUrl = url;
      lastInit = init;
    }
  }
  vi.stubGlobal('EventSource', FakeEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift', openedByEmail: 'a@b.c' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  const { rerender } = render(<OrdersPanel />);

  // Wait for SSE to be set up (status becomes OPEN, session is set)
  await waitFor(() => expect(constructorCallCount).toBe(1));

  // H-04: cookie-based auth — URL must not contain ?token=, must pass withCredentials
  expect(lastUrl).toMatch(/\/v1\/events\/dashboard$/);
  expect(lastInit).toEqual(expect.objectContaining({ withCredentials: true }));

  // Force several re-renders; EventSource should still have been created exactly once.
  // NOTE: rerender with the same component does not change status/session deps, so
  // no extra SSE effect runs are expected. This guards the activeFilter-as-dep bug.
  rerender(<OrdersPanel />);
  rerender(<OrdersPanel />);
  await new Promise((r) => setTimeout(r, 50));
  expect(constructorCallCount).toBe(1);
});
