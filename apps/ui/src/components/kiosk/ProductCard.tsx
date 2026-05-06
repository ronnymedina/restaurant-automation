import type { KioskTheme } from './types/kiosk.types'

type StockStatus = 'available' | 'low_stock' | 'out_of_stock'

type ProductCardProps = {
  title: string
  description?: string
  price: number
  imageUrl?: string
  stockStatus: StockStatus
  onAdd?: () => void
  priceChanged?: boolean
  oldPrice?: number
  theme: KioskTheme
}

export function ProductCard({
  title,
  description,
  price,
  imageUrl,
  stockStatus,
  onAdd,
  priceChanged = false,
  oldPrice,
  theme,
}: ProductCardProps) {
  const isOutOfStock = stockStatus === 'out_of_stock'
  const isLowStock = stockStatus === 'low_stock'

  const cardClass = [
    'bg-white rounded-xl overflow-hidden flex flex-col shadow',
    priceChanged ? 'border border-amber-300' : '',
    isOutOfStock ? 'opacity-50' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClass}>
      <div className="aspect-[4/3] overflow-hidden bg-slate-100 flex items-center justify-center text-4xl">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          '🍽️'
        )}
      </div>

      <div className="p-3 md:p-4 flex-1 flex flex-col">
        <p className="font-semibold text-sm md:text-base leading-tight mb-1">{title}</p>

        {description && (
          <p className="text-xs md:text-sm text-slate-400 mb-2 line-clamp-2">{description}</p>
        )}

        <div className="mt-auto">
          {priceChanged && oldPrice !== undefined && (
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs text-slate-400 line-through">
                Antes ${oldPrice.toFixed(2)}
              </span>
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded">
                Precio actualizado
              </span>
            </div>
          )}

          <p
            className={`font-black text-base md:text-lg ${priceChanged ? 'text-amber-600' : ''}`}
            style={priceChanged ? undefined : { color: theme.text }}
          >
            ${price.toFixed(2)}
          </p>

          {isLowStock && (
            <span className="text-xs text-amber-600 font-medium">Últimos</span>
          )}
          {isOutOfStock && (
            <span className="text-xs text-red-500 font-medium">Agotado</span>
          )}
        </div>

        {!isOutOfStock && (
          <button
            type="button"
            className="mt-2 w-full py-2.5 md:py-4 text-white text-xs md:text-sm font-bold uppercase tracking-wide rounded-lg active:opacity-90 transition-colors cursor-pointer border-none"
            style={{ backgroundColor: theme.primary }}
            onClick={onAdd}
          >
            + Agregar
          </button>
        )}
      </div>
    </div>
  )
}
