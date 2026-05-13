import { useState, useEffect } from 'react';
import { getAccessToken } from '../../../lib/auth';
import { config } from '../../../config';
import { ORDER_EVENTS } from '../../../lib/sse-events';
import { EyeIcon, EyeOffIcon } from '../../commons/icons';
import {
  getCurrentSession, getOrders, updateOrderStatus, markOrderPaid, cancelOrder,
} from './api';
import type { Order, CurrentSession } from './api';
import type { FilterValues } from './OrderFilterPanel';
import OrdersKanban from './OrdersKanban';
import OrdersFilteredList from './OrdersFilteredList';
import OrderFilterPanel from './OrderFilterPanel';
import CancelOrderModal from './CancelOrderModal';
import { ORDERS_STATUS, type OrdersStatus, type OrderStatus } from './types';

interface ActiveFilter extends FilterValues {
  label: string;
}

export default function OrdersPanel() {
  const [status, setStatus] = useState<OrdersStatus>(ORDERS_STATUS.LOADING);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showSensitive, setShowSensitive] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchOrders(cashShiftId: string, filter: ActiveFilter | null) {
    const params: Parameters<typeof getOrders>[0] = { cashShiftId, limit: 30 };
    if (filter?.orderNumber) params.orderNumber = filter.orderNumber;
    if (filter?.statuses.length === 1) params.status = filter.statuses[0];
    const result = await getOrders(params);
    if (result.ok) setOrders(result.data);
  }

  async function loadSession() {
    setStatus(ORDERS_STATUS.LOADING);
    try {
      const result = await getCurrentSession();
      if (!result.ok) {
        setStatus(ORDERS_STATUS.ERROR);
        return;
      }
      if (!result.data) {
        setStatus(ORDERS_STATUS.CLOSED);
        return;
      }
      setSession(result.data);
      setStatus(ORDERS_STATUS.OPEN);
      await fetchOrders(result.data.id, null);
    } catch {
      setStatus(ORDERS_STATUS.ERROR);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  // SSE: reload orders in kanban mode only (filter mode ignores SSE to avoid clobbering the search)
  useEffect(() => {
    if (status !== ORDERS_STATUS.OPEN || !session) return;
    const token = getAccessToken();
    if (!token) return;
    const es = new EventSource(`${config.apiUrl}/v1/events/dashboard?token=${token}`);
    const reload = () => {
      if (!activeFilter) fetchOrders(session.id, null);
    };
    es.addEventListener(ORDER_EVENTS.NEW, reload);
    es.addEventListener(ORDER_EVENTS.UPDATED, reload);
    return () => es.close();
  }, [status, session, activeFilter]);

  async function handleAdvance(id: string, nextStatus: string) {
    const order = orders.find((o) => o.id === id);
    if (nextStatus === 'COMPLETED' && !order?.isPaid) {
      showToast('El pedido debe estar pagado antes de completarse', true);
      return;
    }
    const result = await updateOrderStatus(id, nextStatus);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al actualizar', true);
      return;
    }
    await fetchOrders(session!.id, activeFilter);
  }

  async function handlePay(id: string) {
    const result = await markOrderPaid(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al marcar pagado', true);
      return;
    }
    showToast('Marcado como pagado');
    await fetchOrders(session!.id, activeFilter);
  }

  async function handleCancelConfirm(id: string, reason: string) {
    const result = await cancelOrder(id, reason);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al cancelar', true);
      return;
    }
    setCancelOrderId(null);
    showToast('Pedido cancelado');
    await fetchOrders(session!.id, activeFilter);
  }

  async function handleReceipt(id: string) {
    const token = getAccessToken();
    const res = await fetch(`${config.apiUrl}/v1/print/receipt/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { showToast('Error al obtener recibo', true); return; }
    const receipt = await res.json();
    const win = window.open('', '_blank', 'width=400,height=600');
    if (win) {
      win.document.write(`
        <html><head><title>Recibo #${receipt.orderNumber}</title>
        <style>body{font-family:monospace;padding:20px;max-width:350px;margin:0 auto}table{width:100%;border-collapse:collapse}td,th{padding:4px 0;text-align:left}th:last-child,td:last-child{text-align:right}.total{border-top:2px solid #000;font-weight:bold;font-size:1.2em}</style>
        </head><body>
        <h2>${receipt.restaurantName}</h2>
        <p>Pedido #${receipt.orderNumber}<br>${receipt.date}</p>
        <table>
          <tr><th>Producto</th><th>Cant</th><th>Subtotal</th></tr>
          ${(receipt.items ?? []).map((i: any) => `<tr><td>${i.productName}</td><td>${i.quantity}</td><td>$${i.subtotal.toFixed(2)}</td></tr>${i.notes ? `<tr><td colspan="3" style="color:#666;font-size:0.9em">${i.notes}</td></tr>` : ''}`).join('')}
        </table>
        <p class="total">Total: $${receipt.totalAmount.toFixed(2)}</p>
        <p>Pago: ${receipt.paymentMethod}</p>
        </body></html>
      `);
      win.document.close();
      win.print();
    }
  }

  async function handleApplyFilter(filters: FilterValues) {
    const hasFilter = filters.orderNumber !== undefined || filters.statuses.length > 0;
    if (!hasFilter) {
      setActiveFilter(null);
      setShowFilterPanel(false);
      if (session) await fetchOrders(session.id, null);
      return;
    }
    const parts: string[] = [];
    if (filters.statuses.length > 0) parts.push(filters.statuses.join(', '));
    if (filters.orderNumber) parts.push(`#${filters.orderNumber}`);
    const filter: ActiveFilter = { ...filters, label: parts.join(' + ') };
    setActiveFilter(filter);
    setShowFilterPanel(false);
    if (session) await fetchOrders(session.id, filter);
  }

  const cardCallbacks = {
    onAdvance: handleAdvance,
    onPay: handlePay,
    onCancel: (id: string) => setCancelOrderId(id),
    onReceipt: handleReceipt,
  };

  if (status === ORDERS_STATUS.LOADING) {
    return <div className="text-slate-400 text-center py-8">Cargando...</div>;
  }
  if (status === ORDERS_STATUS.ERROR) {
    return <div className="text-red-400 text-center py-8">Error al cargar</div>;
  }
  if (status === ORDERS_STATUS.CLOSED) {
    return (
      <div className="text-center space-y-3 py-8">
        <div className="text-4xl">🔒</div>
        <p className="text-slate-600 font-medium">
          La caja está cerrada. Abre una sesión para ver los pedidos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Cocina (KDS)</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-400">Sesión:</span>
        <span className="font-mono text-slate-700 text-xs">
          {showSensitive ? session!.id : '••••••••'}
        </span>
        <span className="text-slate-400">Cajero:</span>
        <span className="font-medium text-slate-700">
          {showSensitive ? (session!.openedByEmail ?? '-') : '••••••••'}
        </span>
        <span className="text-slate-400 text-xs">máx. 30 pedidos</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSensitive((v) => !v)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
            title="Mostrar/ocultar datos sensibles"
          >
            {showSensitive ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            type="button"
            onClick={() => setShowFilterPanel(true)}
            className={`px-3 py-1 text-xs font-medium rounded-lg border cursor-pointer ${
              activeFilter
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Filtrar
          </button>
        </div>
      </div>

      {activeFilter ? (
        <OrdersFilteredList
          orders={orders}
          filterLabel={activeFilter.label}
          {...cardCallbacks}
          onClearFilter={() => handleApplyFilter({ statuses: [] })}
        />
      ) : (
        <OrdersKanban orders={orders} {...cardCallbacks} />
      )}

      {showFilterPanel && (
        <OrderFilterPanel onApply={handleApplyFilter} onClose={() => setShowFilterPanel(false)} />
      )}

      {cancelOrderId && (
        <CancelOrderModal
          orderId={cancelOrderId}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelOrderId(null)}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium ${
            toast.isError ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
