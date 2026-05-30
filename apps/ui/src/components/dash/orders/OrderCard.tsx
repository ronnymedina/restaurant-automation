import { useState } from 'react';
import type { Order } from './api';
import { OrderCustomerModal } from './OrderCustomerModal';
import { useRestaurantSettings } from '../../../lib/restaurant-settings';
import { formatMoney } from '../../../lib/money';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Digital',
};

const BORDER_COLORS: Record<string, string> = {
  CREATED: 'border-l-yellow-400',
  CONFIRMED: 'border-l-blue-400',
  PROCESSING: 'border-l-indigo-400',
  SERVED: 'border-l-green-500',
  COMPLETED: 'border-l-green-400',
  CANCELLED: 'border-l-red-400',
};

const ACTIVE_STATUSES = new Set(['CREATED', 'CONFIRMED', 'PROCESSING', 'SERVED']);

const PRIMARY_CONFIGS: Record<string, { color: string }> = {
  CREATED: { color: 'bg-amber-500 hover:bg-amber-600' },
  CONFIRMED: { color: 'bg-blue-600 hover:bg-blue-700' },
  PROCESSING: { color: 'bg-indigo-600 hover:bg-indigo-700' },
  SERVED: { color: 'bg-green-700 hover:bg-green-800' },
};

const PRIMARY_LABELS: Record<string, string> = {
  CREATED: 'Confirmar',
  CONFIRMED: 'Procesar',
  PROCESSING: 'Entregar',
};

const ORDER_SOURCE_LABELS: Record<string, string> = {
  KIOSK: 'Kiosko',
  WEB: 'Web',
  STAFF: 'Personal',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: 'En mesa',
  PICKUP: 'Para retirar',
  DELIVERY: 'Delivery',
};

export interface OrderCardCallbacks {
  onConfirm: (id: string) => void;
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string, paymentMethod?: string) => void;
  onUnpay: (id: string) => void;
  onCancel: (id: string) => void;
  onCancelBlocked: (id: string) => void;
  /** Set of order IDs currently awaiting a mutation response (H-18). */
  inFlightIds?: Set<string>;
}

interface OrderCardProps extends OrderCardCallbacks {
  order: Order;
}

export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked,
  inFlightIds = new Set(),
}: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';
  const isActive = ACTIVE_STATUSES.has(order.status);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [paymentError, setPaymentError] = useState(false);
  const hasCustomerData = order.customerEmail || order.customerPhone || order.deliveryAddress;
  const hasPaymentMethod = !!(order.paymentMethod || selectedPaymentMethod);
  const isBusy = inFlightIds.has(order.id);
  const { data: settings } = useRestaurantSettings();

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${border} shadow-sm`}
      aria-busy={isBusy}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800">#{order.orderNumber}</span>
          <span className="text-xs text-slate-500">{order.displayTime}</span>
        </div>
        <div className="space-y-0.5">
          {(order.items ?? []).map((item) => (
            <div key={item.id}>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{item.quantity}x</span> {item.product?.name ?? '?'}
              </p>
              {item.notes && (
                <p className="text-xs italic text-amber-600 ml-5">{item.notes}</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="font-semibold text-sm text-slate-800">
            {formatMoney(Number(order.totalAmount), settings)}
          </span>
          {isActive && !order.paymentMethod ? (
            <div className="flex items-center gap-1">
              <span className={`text-xs ${paymentError ? 'text-red-500' : 'text-amber-600'}`}>⚠</span>
              <select
                value={selectedPaymentMethod}
                onChange={(e) => { setSelectedPaymentMethod(e.target.value); setPaymentError(false); }}
                className={`text-xs rounded px-1.5 py-0.5 cursor-pointer border ${
                  paymentError
                    ? 'border-red-400 bg-red-50 text-red-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                <option value="" disabled>— Asignar método —</option>
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="DIGITAL_WALLET">Digital</option>
              </select>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              {PAYMENT_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '-'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {order.isPaid ? (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">
              Pagado
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
              No pagado
            </span>
          )}
          <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-slate-100 text-slate-600">
            {ORDER_SOURCE_LABELS[order.orderSource] ?? order.orderSource}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-slate-100 text-slate-600">
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </span>
          {hasCustomerData && (
            <button
              type="button"
              onClick={() => setCustomerModalOpen(true)}
              className="py-0.5 px-2 text-xs font-medium bg-sky-100 text-sky-700 rounded-full cursor-pointer border-none hover:bg-sky-200"
            >
              Ver datos
            </button>
          )}
        </div>
        {order.status === 'CANCELLED' && order.cancellationReason && (
          <p className="text-xs text-red-600 italic mt-1">Motivo: {order.cancellationReason}</p>
        )}
        {isActive && (
          <div className="border-t border-slate-200 pt-2 space-y-1.5">
            {paymentError && (
              <p className="text-xs text-red-500">Selecciona un método de pago para continuar</p>
            )}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                if (order.status === 'CREATED') onConfirm(order.id);
                else if (order.status === 'CONFIRMED') {
                  if (!hasPaymentMethod) { setPaymentError(true); return; }
                  onAdvance(order.id, 'PROCESSING');
                } else if (order.status === 'PROCESSING') onAdvance(order.id, 'SERVED');
                else if (order.status === 'SERVED' && !order.isPaid) {
                  if (!hasPaymentMethod) { setPaymentError(true); return; }
                  onPay(order.id, selectedPaymentMethod || undefined);
                } else if (order.status === 'SERVED' && order.isPaid) onAdvance(order.id, 'COMPLETED');
              }}
              className={`w-full py-2 text-sm font-bold text-white rounded-lg cursor-pointer border-none disabled:opacity-60 disabled:cursor-not-allowed ${PRIMARY_CONFIGS[order.status]?.color ?? ''}`}
            >
              {order.status === 'SERVED'
                ? (order.isPaid ? 'Completar' : 'Cobrar y Completar')
                : PRIMARY_LABELS[order.status]}
            </button>
            <div className="flex gap-1.5">
              {!order.isPaid && order.status !== 'SERVED' && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (!hasPaymentMethod) { setPaymentError(true); return; }
                    onPay(order.id, selectedPaymentMethod || undefined);
                  }}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-green-600 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  ✓ Marcar Pagado
                </button>
              )}
              {order.isPaid && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onUnpay(order.id)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-amber-600 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  ↩ Desmarcar Pago
                </button>
              )}
              {!order.isPaid && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onCancel(order.id)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-red-600 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  ✕ Cancelar
                </button>
              )}
              {order.isPaid && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onCancelBlocked(order.id)}
                  className="flex-1 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md cursor-pointer text-red-600 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Desmarca el pago antes de cancelar"
                >
                  ✕ Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {hasCustomerData && (
        <OrderCustomerModal
          order={order}
          open={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
        />
      )}
    </div>
  );
}
