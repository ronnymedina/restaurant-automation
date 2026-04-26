import type { KioskTheme } from './types/kiosk.types'

export function LoadingScreen({ theme }: { theme: KioskTheme }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm" style={{ color: theme.textMuted }}>Cargando...</p>
    </div>
  )
}
