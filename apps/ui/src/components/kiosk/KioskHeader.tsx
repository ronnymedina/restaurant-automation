import type { KioskTheme } from './types/kiosk.types'

interface KioskHeaderProps {
  title: string
  subtitle?: string
  theme: KioskTheme
}

export function KioskHeader({ title, subtitle, theme }: KioskHeaderProps) {
  return (
    <header
      className="px-4 py-3 md:py-4 lg:py-5 shadow-md flex items-center justify-between"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-white truncate text-base md:text-lg lg:text-xl">{title}</span>
        {subtitle && (
          <span className="text-white/70 text-sm md:text-base">{subtitle}</span>
        )}
      </div>
    </header>
  )
}
