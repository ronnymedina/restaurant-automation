// apps/ui/src/components/dash/orders/CreateOrderStep2.tsx
import { useState } from 'react';

export type OrderType = 'PICKUP' | 'DINE_IN' | 'DELIVERY';

interface Props {
  onNext: (orderType: OrderType) => void;
  onBack: () => void;
}

const ORDER_OPTIONS: { type: OrderType; label: string; description: string }[] = [
  { type: 'PICKUP', label: 'Retiro', description: 'El cliente retira en el local' },
  { type: 'DINE_IN', label: 'En mesa', description: 'Consumo dentro del local' },
  { type: 'DELIVERY', label: 'Delivery', description: 'Envío a domicilio' },
];

export default function CreateOrderStep2({ onNext, onBack }: Props) {
  const [selected, setSelected] = useState<OrderType>('PICKUP');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        ¿Cómo se entrega?
      </p>
      <div className="flex flex-col gap-3">
        {ORDER_OPTIONS.map(({ type, label, description }) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelected(type)}
            className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors cursor-pointer w-full ${
              selected === type
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <div>
              <p
                className={`font-semibold text-sm ${
                  selected === type ? 'text-blue-700' : 'text-slate-800'
                }`}
              >
                {label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm cursor-pointer hover:bg-slate-50"
        >
          ← Volver
        </button>
        <button
          type="button"
          onClick={() => onNext(selected)}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm cursor-pointer"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
