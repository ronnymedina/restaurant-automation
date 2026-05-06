import React from 'react'
import type { KioskTheme, PaymentMethod } from './types/kiosk.types'

type PaymentOption = {
  method: PaymentMethod
  icon: string
  label: string
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { method: 'CASH', icon: '💵', label: 'Efectivo' },
  { method: 'CARD', icon: '💳', label: 'Tarjeta' },
  { method: 'DIGITAL_WALLET', icon: '📱', label: 'Billetera Digital' },
]

type Props = {
  selectedMethod: PaymentMethod | null
  onSelect: (m: PaymentMethod) => void
  customerEmail: string
  onEmailChange: (e: string) => void
  onConfirm: () => void
  onBack: () => void
  isLoading: boolean
  theme: KioskTheme
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelect,
  customerEmail,
  onEmailChange,
  onConfirm,
  onBack,
  isLoading,
  theme,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-6">
        <h2 className="text-xl md:text-2xl font-bold text-center">Método de Pago</h2>

        <div className="grid grid-cols-1 gap-3">
          {PAYMENT_OPTIONS.map(({ method, icon, label }) => {
            const isSelected = selectedMethod === method
            return (
              <button
                key={method}
                onClick={() => onSelect(method)}
                className="py-4 md:py-5 px-6 rounded-xl text-lg md:text-xl font-medium flex items-center gap-3 cursor-pointer bg-white transition-all active:scale-95 w-full border-2"
                style={
                  isSelected
                    ? { borderColor: theme.primary, backgroundColor: theme.background }
                    : { borderColor: '#e2e8f0' }
                }
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        <div>
          <label className="block text-sm md:text-base font-medium text-slate-600 mb-1">
            Email (opcional, para recibo)
          </label>
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="tu@email.com"
            className="w-full px-4 py-3 md:py-4 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': theme.primary } as React.CSSProperties}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={!selectedMethod || isLoading}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            {isLoading ? 'Procesando...' : 'Completar Pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
