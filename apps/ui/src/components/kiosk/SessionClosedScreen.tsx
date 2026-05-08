import type { KioskTheme } from './types/kiosk.types'

interface SessionClosedScreenProps {
  theme: KioskTheme
  restaurantName: string
}

export function SessionClosedScreen({ theme, restaurantName }: SessionClosedScreenProps) {
  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: theme.background }}
    >
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h2
          className="font-bold mb-4"
          style={{ fontSize: '24px', color: theme.text }}
        >
          Pedidos cerrados
        </h2>
        <p
          className="max-w-sm"
          style={{ fontSize: '16px', color: theme.textMuted, lineHeight: '1.6' }}
        >
          La caja de{' '}
          {restaurantName ? <strong style={{ color: theme.text }}>{restaurantName}</strong> : 'este restaurante'}{' '}
          no está disponible en este momento.
          <br />
          Por favor consulta al personal.
        </p>
      </div>
      {restaurantName && (
        <div
          className="py-4 text-center"
          style={{ backgroundColor: '#f97316' }}
        >
          <span
            style={{
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {restaurantName}
          </span>
        </div>
      )}
    </div>
  )
}
