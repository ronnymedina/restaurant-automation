import Modal from '../../commons/Modal';
import type { CloseSummary } from './api';

interface Props {
  open: boolean;
  summary: CloseSummary;
  onClose: () => void;
}

export default function RegisterSummaryModal({ open, summary, onClose }: Props) {
  const breakdownEntries = Object.entries(summary.paymentBreakdown);
  return (
    <Modal open={open} title="Resumen de Caja" onClose={onClose}>
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
    </Modal>
  );
}
