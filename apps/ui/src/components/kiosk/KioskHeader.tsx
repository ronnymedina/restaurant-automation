import type { KioskTheme } from './types/kiosk.types'

interface KioskHeaderProps {
  title: string
  restaurantName: string
  theme: KioskTheme
}

export function KioskHeader({ title, restaurantName, theme }: KioskHeaderProps) {
  return (
    <header
      className="px-4 py-3 md:py-4 lg:py-5 flex items-center justify-between"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="flex flex-col min-w-0">
        {restaurantName && (
          <span
            className="truncate"
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.65)',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
            }}
          >
            {restaurantName}
          </span>
        )}
        <span
          className="font-bold text-white truncate"
          style={{ fontSize: '20px' }}
        >
          {title}
        </span>
      </div>
      <span
        className="flex items-center gap-1.5 flex-shrink-0 ml-3 px-3 py-1 font-medium"
        style={{
          background: '#fff',
          color: '#111',
          borderRadius: '20px',
          fontSize: '13px',
        }}
      >
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: '#22c55e',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        Abierto
      </span>
    </header>
  )
}
