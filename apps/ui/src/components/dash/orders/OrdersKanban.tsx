import { useState } from 'react';
import type { Order } from './api';
import type { OrderCardCallbacks } from './OrderCard';
import OrderCard from './OrderCard';

const PRIMARY_COLUMNS = [
  {
    status: 'CREATED',
    label: 'Creado',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badgeBg: 'bg-yellow-200',
  },
  {
    status: 'PROCESSING',
    label: 'En Proceso',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badgeBg: 'bg-blue-200',
  },
];

const SECONDARY_COLUMNS = [
  {
    status: 'COMPLETED',
    label: 'Completado',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    badgeBg: 'bg-green-200',
  },
  {
    status: 'CANCELLED',
    label: 'Cancelado',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    badgeBg: 'bg-red-200',
  },
];

interface OrdersKanbanProps extends OrderCardCallbacks {
  orders: Order[];
}

export default function OrdersKanban({ orders, onAdvance, onPay, onCancel, onReceipt }: OrdersKanbanProps) {
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);

  const byStatus = (status: string) => orders.filter((o) => o.status === status);
  const cardCallbacks = { onAdvance, onPay, onCancel, onReceipt };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {PRIMARY_COLUMNS.map(({ status, label, bg, border, text, badgeBg }) => {
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

      <button
        type="button"
        onClick={() => setSecondaryExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
      >
        <span className="flex items-center gap-4">
          {SECONDARY_COLUMNS.map(({ status, label, text }) => (
            <span key={status} className={`font-medium ${text}`}>
              {label} ({byStatus(status).length})
            </span>
          ))}
        </span>
        <span>{secondaryExpanded ? '▲' : '▼'}</span>
      </button>

      {secondaryExpanded && (
        <div className="grid grid-cols-2 gap-4">
          {SECONDARY_COLUMNS.map(({ status, label, bg, border, text, badgeBg }) => {
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
                  className={`flex-1 ${bg}/30 border-x border-b ${border} rounded-b-xl p-3 space-y-3 overflow-y-auto max-h-[50vh]`}
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
      )}
    </div>
  );
}
