import type { KioskTheme } from './types/kiosk.types'

type OrderType = 'PICKUP' | 'DELIVERY'

type Props = {
  selected: OrderType
  onSelect: (type: OrderType) => void
  onNext: () => void
  onBack: () => void
  theme: KioskTheme
}

const OPTIONS: { type: OrderType; label: string }[] = [
  { type: 'PICKUP', label: '🏪 Retirar en tienda' },
  { type: 'DELIVERY', label: '🛵 Envío a domicilio' },
]

export function DeliveryTypeScreen({ selected, onSelect, onNext, onBack, theme }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-6">
        <h2 className="text-xl md:text-2xl font-bold text-center text-slate-800">
          ¿Cómo quieres recibir tu pedido?
        </h2>

        <div className="flex flex-col gap-3">
          {OPTIONS.map(({ type, label }) => {
            const isSelected = selected === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                className="flex items-center gap-4 p-4 md:p-5 rounded-xl border-2 text-left w-full cursor-pointer bg-white transition-all active:scale-95"
                style={
                  isSelected
                    ? { borderColor: theme.primary, backgroundColor: '#fff7ed' }
                    : { borderColor: '#e2e8f0' }
                }
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={
                    isSelected
                      ? { borderColor: theme.primary, backgroundColor: theme.primary }
                      : { borderColor: '#cbd5e1' }
                  }
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="text-base md:text-lg font-medium text-slate-800">{label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
