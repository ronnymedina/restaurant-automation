import { useState } from 'react';
import type { Order } from './api';
import { OrderCustomerModal } from './OrderCustomerModal';

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
}

interface OrderCardProps extends OrderCardCallbacks {
  order: Order;
}

export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked,
}: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';
  const isActive = ACTIVE_STATUSES.has(order.status);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const hasCustomerData = order.customerEmail || order.customerPhone || order.deliveryAddress;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${border} shadow-sm`}>
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
            ${Number(order.totalAmount).toFixed(2)}
          </span>
          {isActive && !order.paymentMethod ? (
            <div className="flex items-center gap-1">
              <span className="text-amber-600 text-xs">⚠</span>
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                className="border border-amber-300 bg-amber-50 text-amber-800 text-xs rounded px-1.5 py-0.5 cursor-pointer"
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
        <div className="flex gap-1.5 flex-wrap pt-1">
          {order.status === 'CREATED' && (
            <button
              type="button"
              onClick={() => onConfirm(order.id)}
              className="flex-1 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg cursor-pointer border-none hover:bg-blue-600"
            >
              Confirmar
            </button>
          )}
          {order.status === 'CONFIRMED' && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'PROCESSING')}
              className="flex-1 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg cursor-pointer border-none hover:bg-blue-600"
            >
              Procesar
            </button>
          )}
          {order.status === 'PROCESSING' && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'SERVED')}
              className="flex-1 py-1.5 text-xs font-medium bg-orange-500 text-white rounded-lg cursor-pointer border-none hover:bg-orange-600"
            >
              Entregar
            </button>
          )}
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onUnpay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg cursor-pointer border-none hover:bg-amber-200"
            >
              Desmarcar Pago
            </button>
          )}
          {order.status === 'SERVED' && order.isPaid && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'COMPLETED')}
              className="flex-1 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg cursor-pointer border-none hover:bg-green-600"
            >
              Completar
            </button>
          )}
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onPay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer border-none hover:bg-emerald-200"
            >
              {order.status === 'SERVED' ? 'Cobrar y Completar' : 'Marcar Pagado'}
            </button>
          )}
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onCancel(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-red-100 text-red-700 rounded-lg cursor-pointer border-none hover:bg-red-200"
            >
              Cancelar
            </button>
          )}
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onCancelBlocked(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-slate-100 text-slate-400 rounded-lg cursor-pointer border-none"
              title="Desmarca el pago antes de cancelar"
            >
              Cancelar
            </button>
          )}
        </div>
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
