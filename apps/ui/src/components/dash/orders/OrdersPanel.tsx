import { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
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

  // Keep a ref in sync with activeFilter so the SSE reload callback can read the
  // current value without being a closure dependency of the SSE useEffect.
  // This prevents the SSE connection from being torn down and reopened on every
  // filter change (H-17).
  const activeFilterRef = useRef<ActiveFilter | null>(null);
  useEffect(() => {
    activeFilterRef.current = activeFilter;
  }, [activeFilter]);

  // H-18: Track in-flight order mutations to prevent double-submit.
  // We use a ref (not state) for the Set so that the synchronous guard check
  // `inFlightRef.current.has(id)` sees the latest value even inside React 18's
  // concurrent batching. A separate version counter forces re-renders so that
  // OrderCard receives an updated reference and re-disables/re-enables buttons.
  const inFlightRef = useRef<Set<string>>(new Set());
  const [inFlightVersion, setInFlightVersion] = useState(0);

  const withInFlight = useCallback(async (id: string, fn: () => Promise<void>): Promise<void> => {
    if (inFlightRef.current.has(id)) return; // synchronous guard — prevents double-submit
    inFlightRef.current.add(id);
    setInFlightVersion((v) => v + 1);
    try {
      await fn();
    } finally {
      inFlightRef.current.delete(id);
      setInFlightVersion((v) => v + 1);
    }
  }, []);

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
      if (result.httpStatus === 409 && result.error?.code === 'NO_OPEN_CASH_REGISTER') {
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

  // SSE: reload orders in kanban mode only (filter mode ignores SSE to avoid clobbering the search).
  // activeFilter is intentionally NOT in the deps array — it is read via activeFilterRef.current
  // so the connection stays open across filter changes (H-17).
  useEffect(() => {
    if (status !== ORDERS_STATUS.OPEN || !session) return;
    const es = new EventSource(`${config.apiUrl}/v1/events/dashboard`, { withCredentials: true });
    const reload = () => {
      if (!activeFilterRef.current) fetchOrders(null);
    };
    es.addEventListener(ORDER_EVENTS.NEW, reload);
    es.addEventListener(ORDER_EVENTS.UPDATED, reload);
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);

  async function handleAdvance(id: string, nextStatus: string) {
    await withInFlight(id, async () => {
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
    });
  }

  async function handleConfirm(id: string) {
    await withInFlight(id, async () => {
      if (!session) return;
      const result = await confirmOrder(id);
      if (!result.ok) {
        showToast(result.error.message ?? 'Error al confirmar', true);
        return;
      }
      showToast('Pedido confirmado');
      await fetchOrders(activeFilter);
    });
  }

  async function handlePay(id: string, paymentMethod: string) {
    await withInFlight(id, async () => {
      if (!session) return;
      const result = await markOrderPaid(id, paymentMethod);
      if (!result.ok) {
        showToast(result.error.message ?? 'Error al marcar pagado', true);
        return;
      }
      showToast('Marcado como pagado');
      await fetchOrders(activeFilter);
    });
  }

  async function handleUnpay(id: string) {
    await withInFlight(id, async () => {
      if (!session) return;
      const result = await unmarkOrderPaid(id);
      if (!result.ok) {
        showToast(result.error.message ?? 'Error al desmarcar pago', true);
        return;
      }
      showToast('Pago desmarcado');
      await fetchOrders(activeFilter);
    });
  }

  async function handleCancelConfirm(id: string, reason: string) {
    await withInFlight(id, async () => {
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
    });
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

  // inFlightVersion is read here so that the cardCallbacks object is re-created
  // whenever the in-flight set changes, triggering a re-render in child components.
  void inFlightVersion;
  const cardCallbacks = {
    onConfirm: handleConfirm,
    onAdvance: handleAdvance,
    onPay: handlePay,
    onUnpay: handleUnpay,
    onCancel: (id: string) => setCancelOrderId(id),
    onCancelBlocked: handleCancelBlocked,
    inFlightIds: inFlightRef.current,
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
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
