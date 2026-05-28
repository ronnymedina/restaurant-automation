import { useState, useEffect } from 'react';
import { getAccessToken } from '../../../lib/auth';
import { config } from '../../../config';
import { ORDER_EVENTS } from '../../../lib/sse-events';
import { EyeIcon, EyeOffIcon } from '../../commons/icons';
import {
  getCurrentSession, getOrders, updateOrderStatus, markOrderPaid, cancelOrder,
  confirmOrder, unmarkOrderPaid,
} from './api';
import type { Order, CurrentSession } from './api';
import type { FilterValues } from './OrderFilterPanel';
import OrdersKanban from './OrdersKanban';
import OrdersFilteredList from './OrdersFilteredList';
import OrderFilterPanel from './OrderFilterPanel';
import CancelOrderModal from './CancelOrderModal';
import { ORDERS_STATUS, type OrdersStatus, type OrderStatus } from './types';
import CreateOrderModal from './CreateOrderModal';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchOrders(filter: ActiveFilter | null) {
    const params: Parameters<typeof getOrders>[0] = { limit: 100 };

    if (filter?.orderNumber) {
      params.orderNumber = filter.orderNumber;
      if (filter.statuses.length) params.statuses = filter.statuses;
      // When searching by orderNumber, no default statuses — find in any state
    } else {
      params.statuses = filter?.statuses.length ? filter.statuses : ['CREATED', 'CONFIRMED', 'PROCESSING', 'SERVED'];
    }

    const result = await getOrders(params);
    if (!result.ok) {
      if (result.httpStatus === 409 && result.error?.code === 'REGISTER_NOT_OPEN') {
        setStatus(ORDERS_STATUS.CLOSED);
      }
      return;
    }
    setOrders(result.data);
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
      await fetchOrders(null);
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
      if (!activeFilter) fetchOrders(null);
    };
    es.addEventListener(ORDER_EVENTS.NEW, reload);
    es.addEventListener(ORDER_EVENTS.UPDATED, reload);
    return () => es.close();
  }, [status, session, activeFilter]);

  async function handleAdvance(id: string, nextStatus: string) {
    if (!session) return;
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
    await fetchOrders(activeFilter);
  }

  async function handleConfirm(id: string) {
    if (!session) return;
    const result = await confirmOrder(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al confirmar', true);
      return;
    }
    showToast('Pedido confirmado');
    await fetchOrders(activeFilter);
  }

  async function handlePay(id: string, paymentMethod?: string) {
    if (!session) return;
    const result = await markOrderPaid(id, paymentMethod);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al marcar pagado', true);
      return;
    }
    showToast('Marcado como pagado');
    await fetchOrders(activeFilter);
  }

  async function handleUnpay(id: string) {
    if (!session) return;
    const result = await unmarkOrderPaid(id);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al desmarcar pago', true);
      return;
    }
    showToast('Pago desmarcado');
    await fetchOrders(activeFilter);
  }

  async function handleCancelConfirm(id: string, reason: string) {
    if (!session) return;
    const order = orders.find((o) => o.id === id);
    const result = await cancelOrder(id, reason);
    if (!result.ok) {
      showToast(result.error.message ?? 'Error al cancelar', true);
      return;
    }
    setCancelOrderId(null);
    if (order?.status === 'PROCESSING') {
      showToast('⚠️ Pedido cancelado. Recuerda notificar a tu cocina.', false);
    } else {
      showToast('Pedido cancelado');
    }
    await fetchOrders(activeFilter);
  }

  function handleCancelBlocked(_id: string) {
    showToast('Este pedido está marcado como pagado. Desmarca el pago antes de cancelarlo.', true);
  }

  async function handleApplyFilter(filters: FilterValues) {
    const hasFilter = filters.orderNumber !== undefined || filters.statuses.length > 0;
    if (!hasFilter) {
      setActiveFilter(null);
      setShowFilterPanel(false);
      await fetchOrders(null);
      return;
    }
    const parts: string[] = [];
    if (filters.statuses.length > 0) parts.push(filters.statuses.join(', '));
    if (filters.orderNumber) parts.push(`#${filters.orderNumber}`);
    const filter: ActiveFilter = { ...filters, label: parts.join(' + ') };
    setActiveFilter(filter);
    setShowFilterPanel(false);
    await fetchOrders(filter);
  }

  const cardCallbacks = {
    onConfirm: handleConfirm,
    onAdvance: handleAdvance,
    onPay: handlePay,
    onUnpay: handleUnpay,
    onCancel: (id: string) => setCancelOrderId(id),
    onCancelBlocked: handleCancelBlocked,
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
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
        >
          + Nuevo pedido
        </button>
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
        <span className="text-slate-400 text-xs">máx. 100 pedidos</span>
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

      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(orderNumber) => {
            setShowCreateModal(false);
            showToast(`Pedido #${orderNumber} creado`);
            fetchOrders(activeFilter);
          }}
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
