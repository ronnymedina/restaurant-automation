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
