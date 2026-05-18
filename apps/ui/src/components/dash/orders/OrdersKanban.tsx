import type { Order } from './api';
import type { OrderCardCallbacks } from './OrderCard';
import OrderCard from './OrderCard';

const COLUMNS = [
  {
    status: 'CREATED',
    label: 'Creado',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badgeBg: 'bg-yellow-200',
  },
  {
    status: 'CONFIRMED',
    label: 'Confirmado',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-800',
    badgeBg: 'bg-purple-200',
  },
  {
    status: 'PROCESSING',
    label: 'En Proceso',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badgeBg: 'bg-blue-200',
  },
  {
    status: 'SERVED',
    label: 'Listo para servir o entregar',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    badgeBg: 'bg-orange-200',
  },
];

interface OrdersKanbanProps extends OrderCardCallbacks {
  orders: Order[];
}

export default function OrdersKanban({ orders, onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, onReceipt }: OrdersKanbanProps) {
  const byStatus = (status: string) => orders.filter((o) => o.status === status);
  const cardCallbacks = { onConfirm, onAdvance, onPay, onUnpay, onCancel, onCancelBlocked, onReceipt };

  return (
    <div className="grid grid-cols-4 gap-4">
      {COLUMNS.map(({ status, label, bg, border, text, badgeBg }) => {
        const col = byStatus(status);
        return (
          <div key={status} className="flex flex-col">
            <div className={`${bg} border ${border} rounded-t-xl px-4 py-3 flex items-center justify-between`}>
              <h3 className={`font-bold ${text}`}>{label}</h3>
              <span className={`text-xs font-medium ${badgeBg} ${text} px-2 py-0.5 rounded-full`}>
                {col.length}
              </span>
            </div>
            <div
              className={`flex-1 ${bg}/30 border-x border-b ${border} rounded-b-xl p-3 space-y-3 overflow-y-auto max-h-[70vh]`}
            >
              {col.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Sin pedidos</p>
              ) : (
                col.map((order) => (
                  <OrderCard key={order.id} order={order} {...cardCallbacks} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
