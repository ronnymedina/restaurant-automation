import type { KioskTheme } from './types/kiosk.types'

export function LoadingScreen({ theme }: { theme: KioskTheme }) {
  return (
    <div className="h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
      <p className="text-base md:text-lg" style={{ color: theme.textMuted }}>Cargando...</p>
    </div>
  )
}
