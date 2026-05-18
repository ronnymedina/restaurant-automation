import type { Order } from './api';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Digital',
};

const BORDER_COLORS: Record<string, string> = {
  CREATED: 'border-l-yellow-400',
  CONFIRMED: 'border-l-purple-400',
  PROCESSING: 'border-l-blue-400',
  SERVED: 'border-l-orange-400',
  COMPLETED: 'border-l-green-400',
  CANCELLED: 'border-l-red-400',
};

const ACTIVE_STATUSES = new Set(['CREATED', 'CONFIRMED', 'PROCESSING', 'SERVED']);

export interface OrderCardCallbacks {
  onConfirm: (id: string) => void;
  onAdvance: (id: string, nextStatus: string) => void;
  onPay: (id: string) => void;
  onUnpay: (id: string) => void;
  onCancel: (id: string) => void;
  onCancelBlocked: (id: string) => void;
  onReceipt: (id: string) => void;
}

interface OrderCardProps extends OrderCardCallbacks {
  order: Order;
}

export default function OrderCard({
  order, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, onReceipt,
}: OrderCardProps) {
  const border = BORDER_COLORS[order.status] ?? 'border-l-slate-300';
  const isActive = ACTIVE_STATUSES.has(order.status);

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
          <span className="text-xs text-slate-500">
            {PAYMENT_LABELS[order.paymentMethod ?? ''] ?? order.paymentMethod ?? '-'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {order.isPaid ? (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">
              Pagado
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
              No pagado
            </span>
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
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onPay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer border-none hover:bg-emerald-200"
            >
              Marcar Pagado
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
          <button
            type="button"
            onClick={() => onReceipt(order.id)}
            className="py-1.5 px-2 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg cursor-pointer border-none hover:bg-slate-200"
          >
            Recibo
          </button>
        </div>
      </div>
    </div>
  );
}
