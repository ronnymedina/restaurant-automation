import type { CloseSummary } from './types';

interface Props {
  open: boolean;
  summary: CloseSummary;
  onClose: () => void;
}

export default function RegisterSummaryModal({ open, summary, onClose }: Props) {
  if (!open) return null;

  const breakdownEntries = Object.entries(summary.paymentBreakdown);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-slate-800">Resumen de Caja</h3>
        <div className="space-y-4">
          <div className="bg-emerald-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-lg">
              <span className="font-medium">Total Pedidos</span>
              <span className="font-bold">{summary.totalOrders}</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="font-medium">Total Ventas</span>
              <span className="font-bold text-emerald-700">${summary.totalSales.toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-700">Desglose por Método de Pago</h4>
            {breakdownEntries.length === 0 ? (
              <p className="text-slate-400">Sin pedidos</p>
            ) : (
              breakdownEntries.map(([method, info]) => (
                <div key={method} className="flex justify-between">
                  <span>{method}</span>
                  <span>
                    {info.count} pedidos - ${info.total.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium cursor-pointer border-none hover:bg-indigo-700"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
