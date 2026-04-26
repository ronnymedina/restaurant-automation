import type { KioskTheme } from './types/kiosk.types'

interface ProductNoteFormProps {
  value: string
  onChange: (val: string) => void
  theme: KioskTheme
}

export function ProductNoteForm({ value, onChange }: ProductNoteFormProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Notas (ej: sin cebolla)"
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  )
}
