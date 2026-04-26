import type { KioskTheme } from './types/kiosk.types'

export function SessionClosedScreen({ theme }: { theme: KioskTheme }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl mb-6">🔒</div>
      <h2 className="text-2xl font-bold mb-3" style={{ color: theme.text }}>Caja cerrada</h2>
      <p className="text-base max-w-sm" style={{ color: theme.textMuted }}>Las compras no están habilitadas en este momento.</p>
      <p className="text-sm mt-2" style={{ color: theme.textMuted }}>Por favor contacte al personal del restaurante.</p>
    </div>
  )
}
