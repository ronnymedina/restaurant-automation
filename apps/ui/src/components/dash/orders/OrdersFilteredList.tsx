import type { Order } from './api';
import type { OrderCardCallbacks } from './OrderCard';
import OrderCard from './OrderCard';

interface OrdersFilteredListProps extends OrderCardCallbacks {
  orders: Order[];
  filterLabel: string;
  onClearFilter: () => void;
}

export default function OrdersFilteredList({
  orders,
  filterLabel,
  onClearFilter,
  onAdvance,
  onPay,
  onCancel,
  onReceipt,
}: OrdersFilteredListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium">
          <span>Filtro activo: {filterLabel}</span>
          <button
            type="button"
            onClick={onClearFilter}
            className="hover:text-blue-600 cursor-pointer ml-1"
            aria-label="Limpiar filtro"
          >
            ✕
          </button>
        </div>
        <span className="text-sm text-slate-500">
          {orders.length} resultado{orders.length !== 1 ? 's' : ''}
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin resultados</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={onAdvance}
              onPay={onPay}
              onCancel={onCancel}
              onReceipt={onReceipt}
            />
          ))}
        </div>
      )}
      {orders.length === 100 && (
        <p className="text-xs text-slate-400 text-center py-2">
          Se muestran los primeros 100 pedidos. Para ver el historial completo,{' '}
          <a href="/dash/orders-history" className="underline hover:text-slate-600">
            ve al historial de pedidos →
          </a>
        </p>
      )}
    </div>
  );
}
