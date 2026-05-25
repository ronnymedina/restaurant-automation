import Modal from '../../commons/Modal';
import type { ShiftSummary } from './api';

interface Props {
  open: boolean;
  summary: ShiftSummary;
  onClose: () => void;
}

export default function RegisterSummaryModal({ open, summary, onClose }: Props) {
  return (
    <Modal open={open} title="Resumen de Caja" onClose={onClose}>
      <div className="bg-emerald-50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-lg">
          <span className="font-medium">Total Pedidos</span>
          <span className="font-bold">{summary.counts.completed}</span>
        </div>
        <div className="flex justify-between text-lg">
          <span className="font-medium">Total Ventas</span>
          <span className="font-bold text-emerald-700">${summary.revenue.completed.toFixed(2)}</span>
        </div>
      </div>
      <div className="space-y-2">
        <h4 className="font-semibold text-slate-700">Desglose por Método de Pago</h4>
        {summary.byPaymentMethod.length === 0 ? (
          <p className="text-slate-400">Sin pedidos</p>
        ) : (
          summary.byPaymentMethod.map((item) => (
            <div key={item.method} className="flex justify-between">
              <span>{item.method}</span>
              <span>
                {item.count} pedidos - ${item.total.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
