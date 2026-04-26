import type { CartItem, KioskTheme } from './types/kiosk.types'
import { OrderSummaryItem } from './OrderSummaryItem'

interface OrderSummaryProps {
  items: CartItem[]
  theme: KioskTheme
}

export function OrderSummary({ items, theme }: OrderSummaryProps) {
  if (items.length === 0) {
    return <p className="text-slate-400 text-center">El carrito está vacío</p>
  }

  return (
    <>
      {items.map((item) => (
        <OrderSummaryItem
          key={`${item.productId}:${item.menuItemId ?? ''}`}
          item={item}
          theme={theme}
        />
      ))}
    </>
  )
}
