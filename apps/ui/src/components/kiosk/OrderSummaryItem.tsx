import type { CartItem, KioskTheme } from './types/kiosk.types'
import { QuantityControls } from './QuantityControls'
import { ProductNoteForm } from './ProductNoteForm'
import { useKioskStore } from './store/kiosk.store'

interface OrderSummaryItemProps {
  item: CartItem
  theme: KioskTheme
}

export function OrderSummaryItem({ item, theme }: OrderSummaryItemProps) {
  const store = useKioskStore()
  const hasPriceChange = item.oldPrice !== undefined

  return (
    <div className={`bg-slate-50 rounded-xl p-3 space-y-2${hasPriceChange ? ' border border-amber-200' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{item.name}</p>
          {hasPriceChange && (
            <p className="text-xs text-slate-400 line-through">
              ${(item.oldPrice! * item.quantity).toFixed(2)}
            </p>
          )}
          <p
            className={`font-bold text-sm${hasPriceChange ? ' text-amber-600' : ''}`}
            style={hasPriceChange ? undefined : { color: theme.primary }}
          >
            ${(item.price * item.quantity).toFixed(2)}
          </p>
        </div>
        <QuantityControls
          value={item.quantity}
          onIncrease={() => store.updateQuantity(item.productId, item.menuItemId, 1)}
          onDecrease={() => store.updateQuantity(item.productId, item.menuItemId, -1)}
          theme={theme}
        />
      </div>
      <ProductNoteForm
        value={item.notes}
        onChange={(val) => store.updateNotes(item.productId, item.menuItemId, val)}
        theme={theme}
      />
    </div>
  )
}
