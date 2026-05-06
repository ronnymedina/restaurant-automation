import type { KioskTheme } from './types/kiosk.types'

export function SessionClosedScreen({ theme }: { theme: KioskTheme }) {
  return (
    <div
      className="h-screen flex flex-col items-center justify-center p-8 text-center"
      style={{ backgroundColor: theme.background }}
    >
      <div className="text-6xl md:text-8xl mb-6">🔒</div>
      <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: theme.text }}>Caja cerrada</h2>
      <p className="text-base md:text-lg max-w-sm md:max-w-md" style={{ color: theme.textMuted }}>
        Las compras no están habilitadas en este momento.
      </p>
      <p className="text-sm md:text-base mt-2" style={{ color: theme.textMuted }}>
        Por favor contacte al personal del restaurante.
      </p>
    </div>
  )
}
