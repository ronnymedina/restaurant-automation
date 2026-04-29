import type { Menu, KioskTheme } from './types/kiosk.types'

interface MenuTabsProps {
  menus: Menu[]
  activeMenuId: string | null
  onSelect: (id: string) => void
  theme: KioskTheme
}

export function MenuTabs({ menus, activeMenuId, onSelect, theme }: MenuTabsProps) {
  return (
    <div className="bg-white border-b overflow-x-auto">
      <div className="flex gap-1 py-2 px-2 md:py-3 md:px-3">
        {menus.length === 0 ? (
          <span className="text-sm md:text-base text-slate-400 px-3 py-2">
            No hay menús disponibles en este momento
          </span>
        ) : (
          menus.map((menu) => {
            const isActive = menu.id === activeMenuId
            return (
              <button
                key={menu.id}
                onClick={() => onSelect(menu.id)}
                className={[
                  'whitespace-nowrap px-4 py-2 md:px-6 md:py-3 rounded-lg text-sm md:text-base font-medium transition-colors cursor-pointer border-none',
                  isActive
                    ? 'text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
                style={isActive ? { backgroundColor: theme.primary } : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                {menu.name}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
