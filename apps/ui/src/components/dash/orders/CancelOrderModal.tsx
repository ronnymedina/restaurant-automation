import { useState } from 'react';

interface CancelOrderModalProps {
  orderId: string;
  onConfirm: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}

export default function CancelOrderModal({ orderId, onConfirm, onClose }: CancelOrderModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError(true);
      return;
    }
    setLoading(true);
    await onConfirm(orderId, reason.trim());
    setLoading(false);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold text-slate-800">Cancelar pedido</h3>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Motivo de cancelación *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(false); }}
            placeholder="Ej: Pedido duplicado, error del cliente..."
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              error ? 'border-red-400 ring-red-400' : 'border-slate-300 focus:ring-slate-400'
            }`}
            autoFocus
          />
          {error && (
            <p className="mt-1 text-xs text-red-500">El motivo es requerido</p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium cursor-pointer border-none hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? 'Cancelando...' : 'Confirmar cancelación'}
          </button>
        </div>
      </div>
    </div>
  );
}
