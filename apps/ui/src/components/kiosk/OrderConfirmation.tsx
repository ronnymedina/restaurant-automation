import type { CartItem, KioskTheme } from './types/kiosk.types'

type Props = {
  orderNumber: number
  items: CartItem[]
  total: number
  onNewOrder: () => void
  theme: KioskTheme
}

export function OrderConfirmation({ orderNumber, items, total, onNewOrder, theme }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md p-8 text-center space-y-6">
        <div className="text-6xl">✅</div>
        <h2 className="text-2xl font-bold text-slate-800">¡Pedido Confirmado!</h2>

        {/* Order number box */}
        <div className="rounded-xl p-6" style={{ backgroundColor: `${theme.primary}15` }}>
          <p className="text-sm font-medium" style={{ color: theme.primary }}>
            Tu número de pedido
          </p>
          <p className="text-6xl font-black my-2" style={{ color: theme.primaryDark }}>
            #{orderNumber}
          </p>
        </div>

        {/* Item summary */}
        <div className="text-left text-sm text-slate-600 space-y-1">
          {items.map((item) => (
            <div key={`${item.productId}:${item.menuItemId ?? ''}`} className="flex justify-between">
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-slate-200 pt-2 mt-2">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* New order button */}
        <button
          onClick={onNewOrder}
          style={{ backgroundColor: theme.primary }}
          className="w-full py-4 text-white font-bold text-lg rounded-xl cursor-pointer border-none active:opacity-90"
        >
          Nuevo Pedido
        </button>
      </div>
    </div>
  )
}
