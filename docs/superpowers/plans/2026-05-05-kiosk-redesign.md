# Kiosk Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el rediseño visual del kiosk: paleta carbón `#111827`, fondo `#f8fafc`, tarjetas con sombra (sin bordes), y tipografía más fuerte.

**Architecture:** Todos los componentes del kiosk reciben `theme: KioskTheme` como prop. El cambio de paleta se centraliza en `defaultTheme` dentro de `KioskApp.tsx`, lo que propaga automáticamente a `LoadingScreen`, `SessionClosedScreen`, `OrderConfirmation` y `PaymentMethodSelector`. Los cambios de estilo no-tema (sombras, tipografía, layout) se aplican en cada componente individualmente.

**Tech Stack:** React 18, Tailwind CSS v3, Astro 5 (frontend en `apps/ui/`). El dev server corre con `pnpm dev` desde `apps/ui/` en `localhost:4321`.

---

## File Map

| Archivo | Cambio |
|---|---|
| `apps/ui/src/components/kiosk/KioskApp.tsx` | Actualizar `defaultTheme` (colores) |
| `apps/ui/src/components/kiosk/ProductCard.tsx` | Sombra en lugar de borde, botón uppercase, precio font-black |
| `apps/ui/src/components/kiosk/KioskHeader.tsx` | Badge "Abierto" semitransparente |
| `apps/ui/src/components/kiosk/MenuTabs.tsx` | Border-bottom más sutil |
| `apps/ui/src/components/kiosk/CartFab.tsx` | Emoji 🛒 → 🛍️, sombra con color |
| `apps/ui/src/components/kiosk/ProductGrid.tsx` | Etiqueta de sección más sutil |
| `apps/ui/src/components/kiosk/QuantityControls.tsx` | Border más sutil, color activo desde tema |

> **Nota:** No hay unit tests para componentes visuales puros. Cada tarea termina con verificación en el navegador.

---

## Setup (una vez)

- [ ] Arrancar el dev server:
  ```bash
  # desde apps/ui/
  pnpm dev
  # o desde la raíz
  pnpm dev --filter @restaurants/ui
  ```
  Abrir `http://localhost:4321/kiosk?slug=<slug>` (usar el slug del restaurante dummy que crea `pnpm run cli create-dummy` desde `apps/api-core/`).

---

## Task 1: Actualizar defaultTheme en KioskApp.tsx

**Files:**
- Modify: `apps/ui/src/components/kiosk/KioskApp.tsx:16-24`

- [ ] **Reemplazar el objeto `defaultTheme`:**

  ```tsx
  const defaultTheme: KioskTheme = {
    primary: '#111827',
    primaryDark: '#1f2937',
    accent: '#d97706',
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    textMuted: '#94a3b8',
  }
  ```

- [ ] **Verificar en el navegador:**
  Recargar `localhost:4321/kiosk?slug=<slug>`. El header y los botones "Agregar" deben ser carbón oscuro. El fondo debe ser gris muy claro (no crema).

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/KioskApp.tsx
  git commit -m "feat(kiosk): switch theme to charcoal palette"
  ```

---

## Task 2: Actualizar ProductCard — sombra, tipografía, botón

**Files:**
- Modify: `apps/ui/src/components/kiosk/ProductCard.tsx`

- [ ] **Reemplazar el componente completo:**

  ```tsx
  import type { KioskTheme } from './types/kiosk.types'

  type StockStatus = 'available' | 'low_stock' | 'out_of_stock'

  type ProductCardProps = {
    title: string
    description?: string
    price: number
    imageUrl?: string
    stockStatus: StockStatus
    onAdd?: () => void
    priceChanged?: boolean
    oldPrice?: number
    theme: KioskTheme
  }

  export function ProductCard({
    title,
    description,
    price,
    imageUrl,
    stockStatus,
    onAdd,
    priceChanged = false,
    oldPrice,
    theme,
  }: ProductCardProps) {
    const isOutOfStock = stockStatus === 'out_of_stock'
    const isLowStock = stockStatus === 'low_stock'

    const cardClass = [
      'bg-white rounded-xl overflow-hidden flex flex-col shadow',
      priceChanged ? 'border border-amber-300' : '',
      isOutOfStock ? 'opacity-50' : '',
    ].filter(Boolean).join(' ')

    return (
      <div className={cardClass}>
        <div className="aspect-[4/3] overflow-hidden bg-slate-100 flex items-center justify-center text-4xl">
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            '🍽️'
          )}
        </div>

        <div className="p-3 md:p-4 flex-1 flex flex-col">
          <p className="font-semibold text-sm md:text-base leading-tight mb-1">{title}</p>

          {description && (
            <p className="text-xs md:text-sm text-slate-400 mb-2 line-clamp-2">{description}</p>
          )}

          <div className="mt-auto">
            {priceChanged && oldPrice !== undefined && (
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-xs text-slate-400 line-through">
                  Antes ${oldPrice.toFixed(2)}
                </span>
                <span className="text-xs bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded">
                  Precio actualizado
                </span>
              </div>
            )}

            <p
              className={`font-black text-base md:text-lg ${priceChanged ? 'text-amber-600' : ''}`}
              style={priceChanged ? undefined : { color: theme.text }}
            >
              ${price.toFixed(2)}
            </p>

            {isLowStock && (
              <span className="text-xs text-amber-600 font-medium">Últimos</span>
            )}
            {isOutOfStock && (
              <span className="text-xs text-red-500 font-medium">Agotado</span>
            )}
          </div>

          {!isOutOfStock && (
            <button
              type="button"
              className="mt-2 w-full py-2.5 md:py-4 text-white text-xs md:text-sm font-bold uppercase tracking-wide rounded-lg active:opacity-90 transition-colors cursor-pointer border-none"
              style={{ backgroundColor: theme.primary }}
              onClick={onAdd}
            >
              + Agregar
            </button>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Verificar en el navegador:**
  Las tarjetas deben tener sombra suave (sin borde gris). El precio debe verse más pesado. El botón debe estar en uppercase con espaciado.

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/ProductCard.tsx
  git commit -m "feat(kiosk): update ProductCard to shadow style with stronger typography"
  ```

---

## Task 3: Actualizar KioskHeader — badge Abierto

**Files:**
- Modify: `apps/ui/src/components/kiosk/KioskHeader.tsx`

- [ ] **Reemplazar el componente completo:**

  ```tsx
  import type { KioskTheme } from './types/kiosk.types'

  interface KioskHeaderProps {
    title: string
    subtitle?: string
    theme: KioskTheme
  }

  export function KioskHeader({ title, subtitle, theme }: KioskHeaderProps) {
    return (
      <header
        className="px-4 py-3 md:py-4 lg:py-5 flex items-center justify-between"
        style={{ backgroundColor: theme.primary }}
      >
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-white truncate text-base md:text-lg lg:text-xl">
            {title}
          </span>
          {subtitle && (
            <span className="text-white/70 text-sm md:text-base">{subtitle}</span>
          )}
        </div>
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/10 text-white/80 flex-shrink-0 ml-3">
          ✓ Abierto
        </span>
      </header>
    )
  }
  ```

  > El `shadow-md` del header original se elimina — con el fondo carbón la separación visual es suficiente sin sombra.

- [ ] **Verificar en el navegador:**
  El header debe mostrar el nombre del restaurante a la izquierda y el badge "✓ Abierto" a la derecha con fondo semitransparente.

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/KioskHeader.tsx
  git commit -m "feat(kiosk): add open badge to KioskHeader"
  ```

---

## Task 4: Actualizar MenuTabs — border más sutil

**Files:**
- Modify: `apps/ui/src/components/kiosk/MenuTabs.tsx:12`

- [ ] **Cambiar la clase del contenedor de `border-b` a `border-b border-slate-100`:**

  ```tsx
  <div className="bg-white border-b border-slate-100 overflow-x-auto">
  ```

  Solo cambia esa línea. El resto del componente no se toca.

- [ ] **Verificar en el navegador:**
  La línea debajo de los tabs debe ser casi imperceptible (gris muy claro en lugar del gris estándar).

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/MenuTabs.tsx
  git commit -m "feat(kiosk): use subtler border on MenuTabs"
  ```

---

## Task 5: Actualizar CartFab — emoji y sombra con color

**Files:**
- Modify: `apps/ui/src/components/kiosk/CartFab.tsx`

- [ ] **Reemplazar el componente completo:**

  ```tsx
  import type { KioskTheme } from './types/kiosk.types'

  interface CartFabProps {
    itemCount: number
    onClick: () => void
    theme: KioskTheme
  }

  export function CartFab({ itemCount, onClick, theme }: CartFabProps) {
    if (itemCount === 0) return null

    return (
      <div className="fixed bottom-6 right-6 z-40">
        <div className="relative">
          <button
            onClick={onClick}
            className="rounded-full w-16 h-16 md:w-20 md:h-20 flex items-center justify-center text-2xl md:text-3xl active:scale-95 transition-transform cursor-pointer border-none"
            style={{
              backgroundColor: theme.primary,
              boxShadow: `0 4px 20px rgba(17,24,39,0.4)`,
            }}
            aria-label={`Ver carrito (${itemCount} productos)`}
          >
            <span className="text-white">🛍️</span>
          </button>
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 md:w-7 md:h-7 flex items-center justify-center font-bold border-2 border-white">
            {itemCount}
          </span>
        </div>
      </div>
    )
  }
  ```

- [ ] **Verificar en el navegador:**
  Agregar un producto al carrito. El FAB debe aparecer con el ícono 🛍️ y sombra oscura/cálida.

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/CartFab.tsx
  git commit -m "feat(kiosk): update CartFab icon and shadow"
  ```

---

## Task 6: Actualizar ProductGrid — etiquetas de sección

**Files:**
- Modify: `apps/ui/src/components/kiosk/ProductGrid.tsx:27`

- [ ] **Cambiar la clase del `h3` de sección:**

  ```tsx
  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-6 mb-3 first:mt-0">
    {sectionName}
  </h3>
  ```

  Solo cambia esa línea. El resto del componente no se toca.

- [ ] **Verificar en el navegador:**
  Los títulos de sección (ej. "Principales", "Bebidas") deben verse pequeños, en uppercase y color gris claro — etiquetas de apoyo, no protagonistas.

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/ProductGrid.tsx
  git commit -m "feat(kiosk): restyle ProductGrid section labels to minimal uppercase"
  ```

---

## Task 7: Actualizar QuantityControls — bordes sutiles

**Files:**
- Modify: `apps/ui/src/components/kiosk/QuantityControls.tsx`

- [ ] **Reemplazar el componente completo:**

  ```tsx
  import type { KioskTheme } from './types/kiosk.types'

  interface QuantityControlsProps {
    value: number
    onIncrease: () => void
    onDecrease: () => void
    theme: KioskTheme
    maxQuantity?: number | null
  }

  export function QuantityControls({ value, onIncrease, onDecrease, theme, maxQuantity }: QuantityControlsProps) {
    const atMax = maxQuantity !== null && maxQuantity !== undefined && value >= maxQuantity

    return (
      <div className="flex items-center gap-2">
        <button
          onClick={onDecrease}
          className="w-8 h-8 rounded-full bg-white border border-slate-200 text-lg cursor-pointer flex items-center justify-center"
          aria-label="Decrease quantity"
        >
          <span style={{ color: theme.primary }}>−</span>
        </button>
        <span className="font-bold text-sm w-6 text-center">{value}</span>
        <button
          onClick={onIncrease}
          disabled={atMax}
          className={`w-8 h-8 rounded-full bg-white border border-slate-200 text-lg flex items-center justify-center ${atMax ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label="Increase quantity"
        >
          <span style={{ color: atMax ? '#94a3b8' : theme.primary }}>+</span>
        </button>
      </div>
    )
  }
  ```

- [ ] **Verificar en el navegador:**
  Abrir el carrito, agregar un producto con stock limitado. Los botones `−` / `+` deben tener borde más sutil. Al llegar al máximo el `+` se debe ver desactivado.

- [ ] **Commit:**
  ```bash
  git add apps/ui/src/components/kiosk/QuantityControls.tsx
  git commit -m "feat(kiosk): soften QuantityControls borders"
  ```

---

## Task 8: Verificación del flujo completo

No hay archivos a modificar. Este task valida que el rediseño es coherente de punta a punta.

- [ ] **Flujo de pedido completo:**
  1. `localhost:4321/kiosk?slug=<slug>` → LoadingScreen (fondo gris claro, texto muted)
  2. Grilla de productos → tarjetas con sombra, precios font-black, botones uppercase carbón
  3. Header → nombre a la izquierda, badge "✓ Abierto" a la derecha
  4. Tabs → fondo blanco, border muy sutil, tab activa carbón
  5. Agregar 2+ productos → FAB 🛍️ aparece con sombra oscura
  6. Abrir carrito → CartPanel blanco, botón "Pagar" carbón
  7. Checkout → PaymentMethodSelector blanco, botón "Completar Pedido" carbón
  8. Confirmar → OrderConfirmation con fondo carbón, número de pedido grande

- [ ] **Verificar SessionClosedScreen:**
  Cambiar temporalmente `sessionOpen` a `false` en el store o cerrar la caja desde el dashboard. El fondo debe ser `#f8fafc` con texto oscuro.

- [ ] **Commit final si todo está bien:**
  ```bash
  git add -A
  git commit -m "feat(kiosk): complete minimal charcoal redesign"
  ```
  > Solo necesario si quedaron archivos sin commitear. Si todos los tasks anteriores se commitearon, este paso no aplica.
