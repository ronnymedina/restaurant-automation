import { useState, useEffect } from 'react';
import Modal from '../commons/Modal';
import { config } from '../../config';

interface OrderItem {
  quantity: number;
  productName: string;
  notes?: string;
}

interface OrderData {
  orderId: string;
  orderNumber: number;
  items: OrderItem[];
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STATUS_TRANSITION: 'Transición no permitida para este pedido',
  ORDER_ALREADY_CANCELLED: 'El pedido ya fue cancelado',
  ORDER_NOT_FOUND: 'Pedido no encontrado',
};

export default function KitchenConfirmModal() {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleConfirm(e: Event) {
      const detail = (e as CustomEvent<OrderData>).detail;
      setOrder(detail);
      setOpen(true);
      setError(null);
    }
    window.addEventListener('kitchen:confirm', handleConfirm);
    return () => window.removeEventListener('kitchen:confirm', handleConfirm);
  }, []);

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setOrder(null);
    setError(null);
  }

  async function handleConfirm() {
    if (!order) return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug') ?? '';
    const token =
      params.get('token') ?? sessionStorage.getItem(`kitchen_token_${slug}`) ?? '';

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), 10_000);

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/v1/kitchen/${slug}/orders/${order.orderId}/status?token=${token}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SERVED' }),
          signal: controller.signal,
        },
      );
      clearTimeout(timerId);
      if (res.ok) {
        setOpen(false);
        setOrder(null);
        window.dispatchEvent(new CustomEvent('kitchen:order-updated'));
      } else {
        let msg = 'Error del servidor, intente nuevamente';
        try {
          const body = await res.json();
          if (body?.code && ERROR_MESSAGES[body.code]) msg = ERROR_MESSAGES[body.code];
        } catch { /* ignore parse errors */ }
        setError(msg);
      }
    } catch (err) {
      clearTimeout(timerId);
      const msg =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'La solicitud tardó demasiado, intente nuevamente'
          : 'Error de conexión, intente nuevamente';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Confirmar pedido listo"
      onClose={handleClose}
      dark
      hideCloseButton
    >
      {order && (
        <div>
          <p className="text-slate-300 text-sm font-bold mb-3">Pedido #{order.orderNumber}</p>
          <div className="flex flex-col gap-1 mb-4 pb-4 border-b border-slate-700">
            {order.items.map((item, i) => (
              <div key={i}>
                <span className="text-white text-base">
                  <strong>{item.quantity}×</strong> {item.productName}
                </span>
                {item.notes && (
                  <p className="text-yellow-400 text-sm italic ml-4 mt-0.5">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 py-3 bg-slate-700 text-slate-200 rounded-lg font-bold text-base cursor-pointer border-none hover:bg-slate-600 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold text-base cursor-pointer border-none hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? 'Confirmando...' : '✓ Confirmar listo'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
