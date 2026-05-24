import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import KitchenConfirmModal from './KitchenConfirmModal';

vi.mock('../../config', () => ({
  config: { apiUrl: 'http://test-api' },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  window.history.pushState({}, '', '?slug=rest-slug&token=abc123');
  sessionStorage.clear();
});

function dispatchConfirm(detail = {}) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('kitchen:confirm', {
        detail: {
          orderId: 'order-1',
          orderNumber: 42,
          items: [{ quantity: 2, productName: 'Tacos', notes: undefined }],
          ...detail,
        },
      }),
    );
  });
}

test('does not show dialog initially', () => {
  render(<KitchenConfirmModal />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('opens dialog on kitchen:confirm event', () => {
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Pedido #42')).toBeInTheDocument();
  expect(screen.getByText(/2×/)).toBeInTheDocument();
  expect(screen.getByText(/Tacos/)).toBeInTheDocument();
});

test('shows notes when present', () => {
  render(<KitchenConfirmModal />);
  dispatchConfirm({ items: [{ quantity: 1, productName: 'Burrito', notes: 'sin cebolla' }] });
  expect(screen.getByText('sin cebolla')).toBeInTheDocument();
});

test('closes dialog on Cancelar click', () => {
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('calls PATCH API and dispatches kitchen:order-updated on confirm', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true });
  const listener = vi.fn();
  window.addEventListener('kitchen:order-updated', listener);

  render(<KitchenConfirmModal />);
  dispatchConfirm({ orderId: 'order-abc' });
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api/v1/kitchen/rest-slug/orders/order-abc/status?token=abc123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'SERVED' }),
      }),
    );
    expect(listener).toHaveBeenCalled();
  });

  window.removeEventListener('kitchen:order-updated', listener);
});

test('closes dialog after successful confirm', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true });
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('shows error message on known API error code', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ code: 'ORDER_NOT_FOUND' }),
  });
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.getByText('Pedido no encontrado')).toBeInTheDocument());
});

test('shows generic error on unknown API error', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({}),
  });
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.getByText('Error del servidor, intente nuevamente')).toBeInTheDocument());
});

test('shows error on network failure', async () => {
  mockFetch.mockRejectedValueOnce(new Error('network'));
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.getByText('Error de conexión, intente nuevamente')).toBeInTheDocument());
});

test('shows timeout message when request is aborted', async () => {
  const abortError = new DOMException('Aborted', 'AbortError');
  mockFetch.mockRejectedValueOnce(abortError);
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() =>
    expect(screen.getByText('La solicitud tardó demasiado, intente nuevamente')).toBeInTheDocument(),
  );
});

test('uses sessionStorage token when not in URL', async () => {
  window.history.pushState({}, '', '?slug=rest-slug');
  sessionStorage.setItem('kitchen_token_rest-slug', 'session-token');
  mockFetch.mockResolvedValueOnce({ ok: true });

  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('token=session-token'),
      expect.anything(),
    );
  });
});
