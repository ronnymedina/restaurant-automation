import { useState, useEffect, useRef, useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import { config } from '../../../config';
import { ORDER_EVENTS } from '../../../lib/sse-events';
import type { OrderCreatedPayload, OrderUpdatedPayload } from '../../../lib/sse-payloads';
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
import OrderStatsPanel, { type OrderStatsPanelHandle } from './OrderStatsPanel';

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
  const inFlightRef = useRef<Set<string>>(new Set());
  const statsPanelRef = useRef<OrderStatsPanelHandle>(null);

  // Pending optimistic patches — applied immediately on action, removed on settle.
  // useOptimistic was the original intent but React 19's async transition scheduler
  // does not fire the auto-revert in JSDOM test environments, making it untestable.
  // This manual approach achieves identical UX: immediate patch on action,
  // deterministic revert on failure.
  const [pendingPatches, setPendingPatches] = useState(new Map<string, Partial<Order>>());

  const optimisticOrders = useMemo(
    () =>
      pendingPatches.size === 0
        ? orders
        : orders.map((o) => {
            const patch = pendingPatches.get(o.id);
            return patch ? { ...o, ...patch } : o;
          }),
    [orders, pendingPatches],
  );

  function withOptimisticAction(id: string, patch: Partial<Order>, fn: () => Promise<void>) {
    if (inFlightRef.current.has(id)) return;
    inFlightRef.current.add(id);
    setPendingPatches((prev) => { const m = new Map(prev); m.set(id, patch); return m; });
    void fn().finally(() => {
      inFlightRef.current.delete(id);
      setPendingPatches((prev) => { const m = new Map(prev); m.delete(id); return m; });
    });
  }

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

  // SSE: patch local del estado a partir del payload tipado del evento (H-AUX-02).
  //   - order:new (OrderCreatedPayload): prepend si no existe (idempotente).
  //   - order:updated (OrderUpdatedPayload, delta): merge {...existing, ...delta}
  //     sobre la entrada con el mismo id. Si la orden no está en el array
  //     local (caso: filtro activo o reconexión perdió el NEW), se ignora;
  //     el próximo loadOrders() del onopen cierra el gap.
  //
  // En modo filtro (activeFilter !== null) seguimos ignorando SSE para no
  // pisar la búsqueda. En el onopen del EventSource refetcheamos para
  // recuperar gaps por reconexión.
  // activeFilter se lee vía activeFilterRef.current para no recrear la
  // conexión al cambiar de filtro (H-17).
  useEffect(() => {
    if (status !== ORDERS_STATUS.OPEN || !session) return;
    const es = new EventSource(`${config.apiUrl}/v1/events/dashboard`, { withCredentials: true });

    const handleNew = (e: MessageEvent) => {
      if (activeFilterRef.current) return;
      try {
        const payload = JSON.parse(e.data) as OrderCreatedPayload;
        if (!payload?.id) return;
        setOrders((prev) =>
          prev.some((o) => o.id === payload.id) ? prev : [payload as Order, ...prev],
        );
        statsPanelRef.current?.refresh();
      } catch { /* ignore malformed payload */ }
    };
    const handleUpdated = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as OrderUpdatedPayload;
        if (!payload?.id) return;
        setOrders((prev) => prev.map((o) => (o.id === payload.id ? { ...o, ...payload } : o)));
        statsPanelRef.current?.refresh();
      } catch { /* ignore malformed payload */ }
    };
    // Skip refetch on the very first 'open' — loadSession() already fetched
    // the initial orders. Subsequent opens (reconnections after a network
    // blip) need to refetch to close the gap of events missed while
    // disconnected.
    let hasConnectedBefore = false;
    const handleOpen = () => {
      if (hasConnectedBefore && !activeFilterRef.current) fetchOrders(null);
      hasConnectedBefore = true;
    };

    es.addEventListener('open', handleOpen);
    es.addEventListener(ORDER_EVENTS.NEW, handleNew);
    es.addEventListener(ORDER_EVENTS.UPDATED, handleUpdated);
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);

  function handleAdvance(id: string, nextStatus: string) {
    if (!session) return;
    if (nextStatus === 'COMPLETED') {
      const order = optimisticOrders.find((o) => o.id === id);
      if (!order?.isPaid) { showToast('El pedido debe estar pagado antes de completarse', true); return; }
    }
    withOptimisticAction(id, { status: nextStatus }, async () => {
      const result = await updateOrderStatus(id, nextStatus);
      if (!result.ok) { showToast(result.error.message ?? 'Error al actualizar', true); return; }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
    });
  }

  function handleConfirm(id: string) {
    if (!session) return;
    withOptimisticAction(id, { status: 'CONFIRMED' }, async () => {
      const result = await confirmOrder(id);
      if (!result.ok) { showToast(result.error.message ?? 'Error al confirmar', true); return; }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
      showToast('Pedido confirmado');
    });
  }

  function handlePay(id: string, paymentMethod: string) {
    if (!session) return;
    withOptimisticAction(id, { isPaid: true, paymentMethod }, async () => {
      const result = await markOrderPaid(id, paymentMethod);
      if (!result.ok) { showToast(result.error.message ?? 'Error al marcar pagado', true); return; }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
      showToast('Marcado como pagado');
    });
  }

  function handleUnpay(id: string) {
    if (!session) return;
    withOptimisticAction(id, { isPaid: false, paymentMethod: undefined }, async () => {
      const result = await unmarkOrderPaid(id);
      if (!result.ok) { showToast(result.error.message ?? 'Error al desmarcar pago', true); return; }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
      showToast('Pago desmarcado');
    });
  }

  function handleCancelConfirm(id: string, reason: string) {
    if (!session) return;
    const order = orders.find((o) => o.id === id);
    withOptimisticAction(id, { status: 'CANCELLED', cancellationReason: reason }, async () => {
      const result = await cancelOrder(id, reason);
      if (!result.ok) { showToast(result.error.message ?? 'Error al cancelar', true); return; }
      setCancelOrderId(null);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...result.data } : o)));
      if (order?.status === 'PROCESSING') showToast('⚠️ Pedido cancelado. Recuerda notificar a tu cocina.', false);
      else showToast('Pedido cancelado');
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

      <OrderStatsPanel ref={statsPanelRef} />

      {activeFilter ? (
        <OrdersFilteredList
          orders={optimisticOrders}
          filterLabel={activeFilter.label}
          {...cardCallbacks}
          onClearFilter={() => handleApplyFilter({ statuses: [] })}
        />
      ) : (
        <OrdersKanban orders={optimisticOrders} {...cardCallbacks} />
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
