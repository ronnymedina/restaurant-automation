import type { KioskTheme } from './types/kiosk.types'

interface CartFabProps {
  itemCount: number
  onClick: () => void
  theme: KioskTheme
}

export function CartFab({ itemCount, onClick, theme }: CartFabProps) {
  if (itemCount === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <div className="relative">
        <button
          onClick={onClick}
          className="rounded-full w-16 h-16 md:w-20 md:h-20 shadow-lg flex items-center justify-center text-2xl md:text-3xl active:scale-95 transition-transform cursor-pointer border-none"
          style={{ backgroundColor: theme.primary }}
          aria-label={`Ver carrito (${itemCount} productos)`}
        >
          <span className="text-white">🛒</span>
        </button>
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 md:w-7 md:h-7 flex items-center justify-center font-bold">
          {itemCount}
        </span>
      </div>
    </div>
  )
}
