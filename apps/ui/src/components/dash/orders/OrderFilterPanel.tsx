import { useState } from 'react';
import { ORDER_STATUS, type OrderStatus } from './types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: 'Creado',
  PROCESSING: 'En Proceso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export interface FilterValues {
  orderNumber?: number;
  statuses: OrderStatus[];
}

interface OrderFilterPanelProps {
  onApply: (filters: FilterValues) => void;
  onClose: () => void;
}

export default function OrderFilterPanel({ onApply, onClose }: OrderFilterPanelProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);

  function toggleStatus(s: OrderStatus) {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function handleApply() {
    onApply({
      orderNumber: orderNumber ? parseInt(orderNumber, 10) : undefined,
      statuses,
    });
  }

  function handleClear() {
    setOrderNumber('');
    setStatuses([]);
    onApply({ statuses: [] });
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={handleBackdropClick}
    >
      <div className="absolute right-0 top-0 h-full w-80 bg-white shadow-xl border-l border-slate-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Filtros</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
          >
            ✕
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">N° de pedido</label>
          <input
            type="number"
            min={1}
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Ej: 12"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
          <div className="space-y-2">
            {(Object.values(ORDER_STATUS) as OrderStatus[]).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">{STATUS_LABELS[s]}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleApply}
            className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium cursor-pointer border-none hover:bg-slate-700"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>
  );
}
