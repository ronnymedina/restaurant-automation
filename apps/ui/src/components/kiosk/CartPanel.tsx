import type { KioskTheme } from './types/kiosk.types'
import { useKioskStore } from './store/kiosk.store'
import { OrderSummary } from './OrderSummary'

interface CartPanelProps {
  onClose: () => void
  onCheckout: () => void
  theme: KioskTheme
  variant?: 'overlay' | 'sidebar'
}

function CartFooter({ total, onCheckout, theme }: { total: number; onCheckout: () => void; theme: KioskTheme }) {
  const cart = useKioskStore((s) => s.cart)
  return (
    <div className="p-4 border-t border-slate-200 space-y-3">
      <div className="flex justify-between items-center text-lg font-bold">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
      <button
        onClick={onCheckout}
        disabled={cart.length === 0}
        style={{ backgroundColor: theme.primary }}
        className="w-full py-4 text-white font-bold text-lg rounded-xl transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Pagar
      </button>
    </div>
  )
}

export function CartPanel({ onClose, onCheckout, theme, variant = 'overlay' }: CartPanelProps) {
  const cart = useKioskStore((s) => s.cart)
  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0)

  if (variant === 'sidebar') {
    return (
      <div className="h-full flex flex-col border-l border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold">Tu Pedido</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <OrderSummary items={cart} theme={theme} />
        </div>
        <CartFooter total={total} onCheckout={onCheckout} theme={theme} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold">Tu Pedido</h2>
          <button onClick={onClose} className="text-2xl cursor-pointer border-none bg-transparent leading-none">
            &times;
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <OrderSummary items={cart} theme={theme} />
        </div>
        <CartFooter total={total} onCheckout={onCheckout} theme={theme} />
      </div>
    </div>
  )
}
