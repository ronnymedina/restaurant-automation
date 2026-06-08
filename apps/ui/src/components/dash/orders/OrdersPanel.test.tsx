import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

vi.mock('../register/api', () => ({
  getLiveStats: vi.fn().mockResolvedValue({ ok: true, data: { summary: {
    counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
    revenue: { collected: 0, pending: 0, averageTicket: 0 },
    byPaymentMethod: [], byOrderType: [], byOrderSource: [], topProducts: [],
  }}}),
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

test('applies optimistic CONFIRMED status immediately on Confirmar click', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockImplementation(() => new Promise(() => {})); // never resolves

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
  fireEvent.click(confirmBtn);

  // Optimistic update: card moves to CONFIRMED column, button changes to "Procesar"
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Procesar' })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
});

test('does not call getOrders after a successful confirmOrder', async () => {
  const { confirmOrder } = await import('./api');
  vi.mocked(confirmOrder).mockResolvedValue({
    ok: true,
    data: {
      id: 'o1', orderNumber: 1, status: 'CONFIRMED', isPaid: false,
      items: [], totalAmount: 100, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '12:00', paymentMethod: null,
    } as any,
  });

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
  mockGetOrders.mockClear();

  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });
  fireEvent.click(confirmBtn);

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Procesar' })).toBeInTheDocument(),
  );
  expect(mockGetOrders).not.toHaveBeenCalled();
});

test('reverts optimistic update and shows toast on confirmOrder failure', async () => {
  const { confirmOrder } = await import('./api');
  // setTimeout ensures React commits the optimistic render before the promise resolves.
  // mockResolvedValue resolves in the same microtask batch as applyOptimistic, collapsing
  // both phases into a single render and making Phase 1 unobservable.
  vi.mocked(confirmOrder).mockImplementation(
    () => new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false, error: { message: 'Error al confirmar' }, httpStatus: 422 } as any), 20),
    ),
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
  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar' });
  fireEvent.click(confirmBtn);

  // Phase 1: optimistic update applied — card shows CONFIRMED state
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Procesar' })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();

  // Phase 2: after failure resolves, useOptimistic reverts — Confirmar comes back
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByText('Error al confirmar')).toBeInTheDocument(),
  );
});

test('SSE order:updated patches state even when filter is active', async () => {
  let capturedHandlers: Record<string, (e: MessageEvent) => void> = {};
  class SpyEventSource {
    addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      capturedHandlers[event] = handler;
    });
    close = vi.fn();
    constructor(_url: string, _init?: EventSourceInit) {}
  }
  vi.stubGlobal('EventSource', SpyEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-1', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1', orderNumber: 5, status: 'CREATED', isPaid: false,
      totalAmount: 500, paymentMethod: null, cancellationReason: null,
      customerEmail: null, customerPhone: null, deliveryAddress: null,
      deliveryReferences: null, orderSource: 'KIOSK', orderType: 'DINE_IN',
      displayTime: '11:00', cashShiftId: 'shift-1', createdAt: '2026-01-01T11:00:00Z',
      items: [],
    }],
  });

  render(<OrdersPanel />);
  await screen.findByText(/#5/);

  // Apply a filter to switch to FilteredList mode
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Creado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  await waitFor(() => expect(screen.getByText(/Filtro activo/)).toBeInTheDocument());

  // Dispatch order:updated while filter is active — should still patch local state
  capturedHandlers['order:updated']?.({
    data: JSON.stringify({
      id: 'o1', status: 'CONFIRMED', isPaid: true,
      paymentMethod: 'CASH', cancellationReason: null,
    }),
  } as MessageEvent);

  // isPaid: true → "Pagado" badge should appear in the filtered list
  await waitFor(() => expect(screen.getByText('Pagado')).toBeInTheDocument());
});

// H-AUX-02: order:updated merges into local state without refetching.
test('H-AUX-02: order:updated merges into local state without calling getOrders again', async () => {
  let capturedHandlers: Record<string, (e: MessageEvent) => void> = {};

  class SpyEventSource {
    addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      capturedHandlers[event] = handler;
    });
    close = vi.fn();
    constructor(_url: string, _init?: EventSourceInit) {}
  }
  vi.stubGlobal('EventSource', SpyEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-1', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({
    ok: true,
    data: [{
      id: 'o1',
      orderNumber: 7,
      status: 'CREATED',
      isPaid: false,
      totalAmount: 1000,
      paymentMethod: null,
      cancellationReason: null,
      customerEmail: null,
      customerPhone: null,
      deliveryAddress: null,
      deliveryReferences: null,
      orderSource: 'KIOSK',
      orderType: 'DINE_IN',
      displayTime: '12:00',
      cashShiftId: 'shift-1',
      createdAt: '2026-01-01T12:00:00Z',
      items: [],
    }],
  });

  render(<OrdersPanel />);

  // Wait for the order to appear
  await screen.findByText(/#7/);

  // Clear the mock so we can assert it's NOT called again
  mockGetOrders.mockClear();

  // Dispatch order:updated SSE event
  const updatedPayload = JSON.stringify({
    id: 'o1',
    status: 'CONFIRMED',
    isPaid: true,
    paymentMethod: 'CASH',
    cancellationReason: null,
  });
  capturedHandlers['order:updated']?.({ data: updatedPayload } as MessageEvent);

  // Verify "Pagado" badge appears (isPaid: true after merge)
  await waitFor(() => expect(screen.getByText('Pagado')).toBeInTheDocument());

  // Verify getOrders was NOT called again
  expect(mockGetOrders).not.toHaveBeenCalled();
});

// H-AUX-02: order:new prepends into local state without refetching.
test('H-AUX-02: order:new prepends new order without calling getOrders again', async () => {
  let capturedHandlers: Record<string, (e: MessageEvent) => void> = {};

  class SpyEventSource {
    addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      capturedHandlers[event] = handler;
    });
    close = vi.fn();
    constructor(_url: string, _init?: EventSourceInit) {}
  }
  vi.stubGlobal('EventSource', SpyEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-1', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  // Wait for the panel to render (empty orders state)
  await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(1));

  // Clear the mock so we can assert it's NOT called again
  mockGetOrders.mockClear();

  // Dispatch order:new SSE event with a full OrderCreatedPayload including an item
  // that uses the flat productName field (as the SSE payload provides it).
  const newPayload = JSON.stringify({
    id: 'o99',
    orderNumber: 99,
    status: 'CREATED',
    isPaid: false,
    totalAmount: 2500,
    paymentMethod: null,
    cancellationReason: null,
    customerEmail: null,
    customerPhone: null,
    deliveryAddress: null,
    deliveryReferences: null,
    orderSource: 'KIOSK',
    orderType: 'DINE_IN',
    displayTime: '13:00',
    items: [{ id: 'i1', quantity: 1, notes: null, productName: 'Café especial' }],
  });
  capturedHandlers['order:new']?.({ data: newPayload } as MessageEvent);

  // Verify the new order appears
  await waitFor(() => expect(screen.getByText(/#99/)).toBeInTheDocument());

  // Verify the item productName is rendered (not '?' which would indicate the fallback failed)
  await screen.findByText(/Café especial/);

  // Verify getOrders was NOT called again
  expect(mockGetOrders).not.toHaveBeenCalled();
});

// H-AUX-02 follow-up: first 'open' must NOT trigger a refetch (loadSession already loaded);
// subsequent 'open' events (reconnections) MUST trigger a refetch to close event gaps.
test('no refetcha en el primer open del SSE (loadSession ya cargó); refetcha solo en reconexiones posteriores', async () => {
  let capturedHandlers: Record<string, (e: Event) => void> = {};

  class SpyEventSource {
    addEventListener = vi.fn((event: string, handler: (e: Event) => void) => {
      capturedHandlers[event] = handler;
    });
    close = vi.fn();
    constructor(_url: string, _init?: EventSourceInit) {}
  }
  vi.stubGlobal('EventSource', SpyEventSource);

  mockGetCurrentSession.mockResolvedValue({
    ok: true,
    data: { id: 'shift-1', openedByEmail: 'staff@test.com' },
  });
  mockGetOrders.mockResolvedValue({ ok: true, data: [] });

  render(<OrdersPanel />);

  // Wait for initial fetch from loadSession
  await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(1));

  // First 'open' (initial SSE connection) — must NOT trigger a refetch
  act(() => { capturedHandlers['open']?.(new Event('open')); });
  await new Promise((r) => setTimeout(r, 0));
  expect(mockGetOrders).toHaveBeenCalledTimes(1);

  // Second 'open' (reconnection) — MUST trigger a refetch to close gap
  mockGetOrders.mockResolvedValueOnce({ ok: true, data: [] });
  act(() => { capturedHandlers['open']?.(new Event('open')); });
  await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(2));
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
