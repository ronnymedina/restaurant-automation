import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RegisterPanel from './RegisterPanel';

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '../../../lib/api';
const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

test('shows loading state initially', () => {
  mockApiFetch.mockReturnValue(new Promise(() => {}));
  render(<RegisterPanel />);
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('shows closed state when API returns no active session', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => null } as Response);
  render(<RegisterPanel />);
  await waitFor(() => expect(screen.getByText('Caja Cerrada')).toBeInTheDocument());
});

test('shows closed state when API returns empty object', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  render(<RegisterPanel />);
  await waitFor(() => expect(screen.getByText('Caja Cerrada')).toBeInTheDocument());
});

test('shows open state with register data', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 'abc-123',
      openedAt: '2026-01-01T10:00:00.000Z',
      lastOrderNumber: 7,
      user: { email: 'staff@test.com' },
      _count: { orders: 4 },
    }),
  } as Response);
  render(<RegisterPanel />);
  await waitFor(() => expect(screen.getByText('Caja Abierta')).toBeInTheDocument());
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
});

test('shows permission error on 403', async () => {
  mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);
  render(<RegisterPanel />);
  await waitFor(() =>
    expect(
      screen.getByText('No tienes permisos para acceder a esta sección'),
    ).toBeInTheDocument(),
  );
});

test('shows generic error on non-403 API failure', async () => {
  mockApiFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
  render(<RegisterPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar el estado de la caja')).toBeInTheDocument(),
  );
});

test('shows error on network failure', async () => {
  mockApiFetch.mockRejectedValue(new Error('Network error'));
  render(<RegisterPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar el estado de la caja')).toBeInTheDocument(),
  );
});

// --- openRegister ---

test('clicking Abrir Caja calls open API endpoint', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response) // loadStatus → closed
    .mockResolvedValueOnce({ ok: true } as Response) // openRegister
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response); // loadStatus after open

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Abrir Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Caja' }));

  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/v1/cash-register/open', { method: 'POST' }),
  );
});

test('shows error Alert when openRegister API fails', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Ya hay una caja abierta' }),
    } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Abrir Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Caja' }));

  await waitFor(() =>
    expect(screen.getByText('Ya hay una caja abierta')).toBeInTheDocument(),
  );
});

test('shows fallback error message when openRegister fails without message', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response)
    .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Abrir Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Caja' }));

  await waitFor(() =>
    expect(screen.getByText('Error al abrir caja')).toBeInTheDocument(),
  );
});

// --- closeRegister ---

const openData = {
  id: 'shift-abc',
  openedAt: '2026-01-01T10:00:00.000Z',
  lastOrderNumber: 3,
  user: { email: 'admin@test.com' },
  _count: { orders: 2 },
};

test('clicking Cerrar Caja shows warning Alert', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  expect(screen.getByText('¿Estás seguro de cerrar la caja?')).toBeInTheDocument();
});

test('canceling close Alert hides it', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByText('¿Estás seguro de cerrar la caja?')).not.toBeInTheDocument();
});

test('confirming close calls close API endpoint', async () => {
  const summary = { totalOrders: 2, totalSales: 100, paymentBreakdown: {} };
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ summary }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/v1/cash-register/close', { method: 'POST' }),
  );
});

test('shows RegisterSummaryModal on successful close', async () => {
  const summary = { totalOrders: 5, totalSales: 250, paymentBreakdown: {} };
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ summary }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() => expect(screen.getByText('Resumen de Caja')).toBeInTheDocument());
  expect(screen.getByText('$250.00')).toBeInTheDocument();
});

test('shows error Alert on PENDING_ORDERS_ON_SHIFT', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        code: 'PENDING_ORDERS_ON_SHIFT',
        details: { pendingCount: 3 },
      }),
    } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() =>
    expect(
      screen.getByText(/Hay 3 pedido\(s\) pendiente\(s\)/),
    ).toBeInTheDocument(),
  );
});

test('shows error Alert on generic close failure', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Error interno' }),
    } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() =>
    expect(screen.getByText('Error interno')).toBeInTheDocument(),
  );
});

// --- obfuscated fields ---

test('id field is obfuscated by default and toggles on click', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByText('Caja Abierta'));

  expect(screen.queryByText('shift-abc')).not.toBeInTheDocument();

  const toggleButtons = screen.getAllByTitle('Mostrar/ocultar');
  fireEvent.click(toggleButtons[0]); // primer toggle = id

  expect(screen.getByText('shift-abc')).toBeInTheDocument();
});

test('email field is obfuscated by default and toggles on click', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByText('Caja Abierta'));

  expect(screen.queryByText('admin@test.com')).not.toBeInTheDocument();

  const toggleButtons = screen.getAllByTitle('Mostrar/ocultar');
  fireEvent.click(toggleButtons[1]); // segundo toggle = email

  expect(screen.getByText('admin@test.com')).toBeInTheDocument();
});
