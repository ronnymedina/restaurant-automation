import type { AddToCartPayload, KioskTheme, MenuItem } from './types/kiosk.types'
import { ProductCard } from './ProductCard'

type ProductGridProps = {
  sections: Record<string, MenuItem[]>
  theme: KioskTheme
  onAddItem: (item: AddToCartPayload) => void
}

export function ProductGrid({ sections, theme, onAddItem }: ProductGridProps) {
  const sectionEntries = Object.entries(sections)
  const hasItems = sectionEntries.some(([, items]) => items.length > 0)

  if (sectionEntries.length === 0 || !hasItems) {
    return (
      <div className="text-center text-slate-400 py-12">
        No hay productos en este menú
      </div>
    )
  }

  return (
    <div>
      {sectionEntries.map(([sectionName, items], index) => (
        <div key={sectionName} className={index === 0 ? '' : 'mt-10'}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-200" />
            <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap flex-shrink-0 m-0">
              {sectionName}
            </h3>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 pb-2">
            {items.map((item) => (
              <ProductCard
                key={item.menuItemId ?? item.id}
                title={item.name}
                description={item.description}
                price={item.price}
                imageUrl={item.imageUrl}
                stockStatus={item.stockStatus}
                theme={theme}
                onAdd={() =>
                  onAddItem({
                    productId: item.id,
                    menuItemId: item.menuItemId,
                    name: item.name,
                    price: item.price,
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
