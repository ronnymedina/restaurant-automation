import { useMemo } from 'react'
import type { CartItem, KioskTheme } from './types/kiosk.types'
import { QuantityControls } from './QuantityControls'
import { ProductNoteForm } from './ProductNoteForm'
import { useKioskStore } from './store/kiosk.store'

interface OrderSummaryItemProps {
  item: CartItem
  theme: KioskTheme
}

export function OrderSummaryItem({ item, theme }: OrderSummaryItemProps) {
  const updateQuantity = useKioskStore((s) => s.updateQuantity)
  const updateNotes = useKioskStore((s) => s.updateNotes)
  const menuSections = useKioskStore((s) => s.menuSections)

  const maxStock = useMemo(() => {
    const allItems = Object.values(menuSections).flatMap((sections) =>
      Object.values(sections).flat(),
    )
    return allItems.find((i) => i.id === item.productId && i.menuItemId === item.menuItemId)?.stock ?? null
  }, [menuSections, item.productId, item.menuItemId])

  return (
    <div className={`bg-slate-50 rounded-xl p-3 space-y-2${item.oldPrice !== undefined ? ' border border-amber-200' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{item.name}</p>
          {item.oldPrice !== undefined && (
            <p className="text-xs text-slate-400 line-through">
              ${(item.oldPrice * item.quantity).toFixed(2)}
            </p>
          )}
          <p
            className={`font-bold text-sm${item.oldPrice !== undefined ? ' text-amber-600' : ''}`}
            style={item.oldPrice !== undefined ? undefined : { color: theme.primary }}
          >
            ${(item.price * item.quantity).toFixed(2)}
          </p>
        </div>
        <QuantityControls
          value={item.quantity}
          onIncrease={() => updateQuantity(item.productId, item.menuItemId, 1)}
          onDecrease={() => updateQuantity(item.productId, item.menuItemId, -1)}
          theme={theme}
          maxQuantity={maxStock}
        />
      </div>
      <ProductNoteForm
        value={item.notes}
        onChange={(val) => updateNotes(item.productId, item.menuItemId, val)}
        theme={theme}
      />
    </div>
  )
}
