import type { KioskTheme } from './types/kiosk.types'

interface QuantityControlsProps {
  value: number
  onIncrease: () => void
  onDecrease: () => void
  theme: KioskTheme
  maxQuantity?: number | null
}

export function QuantityControls({ value, onIncrease, onDecrease, theme, maxQuantity }: QuantityControlsProps) {
  const atMax = maxQuantity !== null && maxQuantity !== undefined && value >= maxQuantity

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onDecrease}
        className="w-8 h-8 rounded-full bg-white border border-slate-300 text-lg cursor-pointer flex items-center justify-center"
        aria-label="Decrease quantity"
      >
        <span style={{ color: theme.primary }}>−</span>
      </button>
      <span className="font-bold text-sm w-6 text-center">{value}</span>
      <button
        onClick={onIncrease}
        disabled={atMax}
        className={`w-8 h-8 rounded-full bg-white border border-slate-300 text-lg flex items-center justify-center ${atMax ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label="Increase quantity"
      >
        <span style={{ color: atMax ? '#94a3b8' : theme.primary }}>+</span>
      </button>
    </div>
  )
}
