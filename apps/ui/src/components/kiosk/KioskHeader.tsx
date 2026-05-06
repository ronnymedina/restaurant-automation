import type { KioskTheme } from './types/kiosk.types'

interface KioskHeaderProps {
  title: string
  subtitle?: string
  theme: KioskTheme
}

export function KioskHeader({ title, subtitle, theme }: KioskHeaderProps) {
  return (
    <header
      className="px-4 py-3 md:py-4 lg:py-5 flex items-center justify-between"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-white truncate text-base md:text-lg lg:text-xl">
          {title}
        </span>
        {subtitle && (
          <span className="text-white/70 text-sm md:text-base">{subtitle}</span>
        )}
      </div>
      <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/10 text-white/80 flex-shrink-0 ml-3">
        ✓ Abierto
      </span>
    </header>
  )
}
