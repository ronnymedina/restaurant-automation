# Spec: Consistencia de colores — Login y Onboarding

**Fecha:** 2026-05-07
**Objetivo:** Alinear login y onboarding a la paleta Clara & Moderna de la landing (`#fafaf8` / `#f97316` / `#111`), incluyendo el estilo de card.

---

## Paleta de referencia (landing `index.astro`)

| Token | Valor | Uso |
|-------|-------|-----|
| Fondo | `#fafaf8` | Página completa |
| Acento primario | `#f97316` | Botones, iconos, focus, activo |
| Acento hover | `#ea6c0a` | Hover de botones naranjas |
| Texto principal | `#111` | Headings |
| Texto secundario | `#555`, `#888` | Subtítulos, placeholders |
| Card | `bg-white rounded-xl shadow-md` | Contenedor de formularios |

---

## Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `apps/ui/src/pages/login.astro` | Fondo, card, icono, botón, focus, link, spinner |
| `apps/ui/src/pages/onboarding.astro` | Fondo |
| `apps/ui/src/components/onboarding/OnboardingWizard.tsx` | Card, step activo, conector |
| `apps/ui/src/components/onboarding/Step1Form.tsx` | Focus border/ring, botón |
| `apps/ui/src/components/onboarding/Step2Upload.tsx` | Drop zone, info box, botón, back hover, stroke imagen |
| `apps/ui/src/components/onboarding/Step3Success.tsx` | Icono email, info box |

---

## Cambios detallados

### `login.astro`
- Wrapper bg: `bg-gradient-to-br from-[#667eea] to-[#764ba2]` → `bg-[#fafaf8]`
- Card: `bg-white/95 rounded-3xl shadow-2xl` → `bg-white rounded-xl shadow-md`
- Icono SVG: `text-indigo-500` → `text-[#f97316]`
- Input focus: `focus:border-indigo-500 focus:ring-indigo-500/10` → `focus:border-[#f97316] focus:ring-[#f97316]/10`
- Botón submit: `bg-indigo-500 hover:bg-indigo-600` → `bg-[#f97316] hover:bg-[#ea6c0a]`
- Spinner: `border-t-indigo-500` → `border-t-[#f97316]`
- Link registro: `text-indigo-500 hover:text-indigo-600` → `text-[#f97316] hover:text-[#ea6c0a]`

### `onboarding.astro`
- Wrapper bg: `bg-gradient-to-br from-[#667eea] to-[#764ba2]` → `bg-[#fafaf8]`

### `OnboardingWizard.tsx`
- Card: `bg-white/95 rounded-3xl shadow-2xl` → `bg-white rounded-xl shadow-md`
- Step activo (círculo): `bg-indigo-500` → `bg-[#f97316]`
- Conector completado: `bg-indigo-500` → `bg-[#f97316]`
- Label activo: `text-indigo-500` → `text-[#f97316]`

### `Step1Form.tsx`
- `inputBase` — focus: `focus:border-indigo-500 focus:ring-indigo-500/10` → `focus:border-[#f97316] focus:ring-[#f97316]/10`
- Border válido: `focus:border-indigo-500` → `focus:border-[#f97316]`
- Border neutral: `focus:border-indigo-500` → `focus:border-[#f97316]`
- Botón: `bg-indigo-500 hover:bg-indigo-600` → `bg-[#f97316] hover:bg-[#ea6c0a]`

### `Step2Upload.tsx`
- Drop zone activo (foto seleccionada): `border-indigo-500 bg-indigo-50` → `border-[#f97316] bg-orange-50`
- Drop zone drag over: `border-indigo-400 bg-indigo-50` → `border-[#f97316]/70 bg-orange-50`
- Drop zone hover: `hover:border-indigo-500 hover:bg-indigo-50/50` → `hover:border-[#f97316] hover:bg-orange-50/50`
- Icono upload activo: `text-indigo-500` → `text-[#f97316]`
- Icono upload inactivo: `text-indigo-300` → `text-[#f97316]/30`
- Texto "Haz clic para cambiarla": `text-indigo-500` → `text-[#f97316]`
- Icono imagen en pill: `stroke="#6366f1"` → `stroke="#f97316"`
- Info box AI: `bg-violet-50 border-violet-200 text-violet-600 text-violet-800` → `bg-orange-50 border-orange-200 text-[#f97316] text-[#9a3412]`
- Botón principal: `bg-indigo-500 hover:bg-indigo-600` → `bg-[#f97316] hover:bg-[#ea6c0a]`
- Botón volver hover: `hover:text-indigo-500` → `hover:text-[#f97316]`

### `Step3Success.tsx`
- Icono email: `text-indigo-500` → `text-[#f97316]`
- Info box "Revisa tu correo": `bg-gradient-to-br from-blue-50 to-sky-50 border-blue-200` → `bg-orange-50 border-orange-200`

---

## Lo que NO cambia

- Colores de validación: `emerald-500` (campo válido), `red-500` (error) — son semánticos, no de marca
- Step completado: `bg-emerald-500` — semántico
- Summary card en Step3: `bg-green-50` — semántico
- Estructura HTML/JSX y lógica de todos los archivos

---

## Enfoque de implementación

Approach A — reemplazo directo de hex inline, sin cambios a tailwind.config ni CSS custom properties. Consistente con el patrón del codebase.
