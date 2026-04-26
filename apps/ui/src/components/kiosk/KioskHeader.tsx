import type { KioskTheme } from './types/kiosk.types'

interface KioskHeaderProps {
  title: string
  subtitle?: string
  theme: KioskTheme
}

export function KioskHeader({ title, subtitle, theme }: KioskHeaderProps) {
  return (
    <header
      className="px-4 py-3 shadow-md flex items-center justify-between"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-white truncate">{title}</span>
        {subtitle && (
          <span className="text-white/70 text-sm">{subtitle}</span>
        )}
      </div>
    </header>
  )
}
