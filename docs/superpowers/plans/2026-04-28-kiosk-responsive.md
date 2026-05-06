# Kiosk Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the kiosk fully responsive — sidebar cart layout on screens ≥1024px, bottom-sheet cart on narrower screens, with scaled touch targets and typography across all components.

**Architecture:** A `useViewport` hook detects sidebar mode (`window.innerWidth >= 1024`). `KioskApp` renders one of two root layouts based on that flag. `CartPanel` gains a `variant` prop (`'overlay'` | `'sidebar'`). All other components get Tailwind responsive classes for font/padding scaling.

**Tech Stack:** React 18, Tailwind CSS, Vitest + @testing-library/react, Astro (shell only — no changes needed there)

**Spec:** `docs/superpowers/specs/2026-04-28-kiosk-responsive-design.md`

**Run tests from:** `apps/ui/` with `pnpm test`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/kiosk/hooks/useViewport.ts` | **Create** | Detects sidebar mode from window width, reactive on resize |
| `src/components/kiosk/hooks/useViewport.test.ts` | **Create** | Unit tests for the hook |
| `src/components/kiosk/CartPanel.tsx` | **Modify** | Add `variant: 'overlay' \| 'sidebar'` prop |
| `src/components/kiosk/KioskApp.tsx` | **Modify** | Two root layouts (sidebar vs portrait) using the hook |
| `src/components/kiosk/ProductGrid.tsx` | **Modify** | Responsive grid columns + gap |
| `src/components/kiosk/ProductCard.tsx` | **Modify** | Scale text, padding, button touch target |
| `src/components/kiosk/KioskHeader.tsx` | **Modify** | Scale padding and title text |
| `src/components/kiosk/MenuTabs.tsx` | **Modify** | Scale tab padding and text |
| `src/components/kiosk/PaymentMethodSelector.tsx` | **Modify** | Scale max-width and button sizes |
| `src/components/kiosk/OrderConfirmation.tsx` | **Modify** | Scale order number and button |
| `src/components/kiosk/LoadingScreen.tsx` | **Modify** | Scale text |
| `src/components/kiosk/SessionClosedScreen.tsx` | **Modify** | Scale icon, text, max-width |
| `src/components/kiosk/CartFab.tsx` | **Modify** | Scale button size |

---

## Task 1: `useViewport` hook

**Files:**
- Create: `apps/ui/src/components/kiosk/hooks/useViewport.ts`
- Create: `apps/ui/src/components/kiosk/hooks/useViewport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/components/kiosk/hooks/useViewport.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useViewport } from './useViewport'

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

test('returns isSidebarMode=false when width < 1024', () => {
  setWindowWidth(768)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(false)
})

test('returns isSidebarMode=true when width >= 1024', () => {
  setWindowWidth(1024)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(true)
})

test('updates isSidebarMode when window is resized to wide', () => {
  setWindowWidth(768)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(false)

  act(() => {
    setWindowWidth(1280)
    window.dispatchEvent(new Event('resize'))
  })

  expect(result.current.isSidebarMode).toBe(true)
})

test('updates isSidebarMode when window is resized to narrow', () => {
  setWindowWidth(1280)
  const { result } = renderHook(() => useViewport())
  expect(result.current.isSidebarMode).toBe(true)

  act(() => {
    setWindowWidth(768)
    window.dispatchEvent(new Event('resize'))
  })

  expect(result.current.isSidebarMode).toBe(false)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/ui && pnpm test -- useViewport
```

Expected: `Cannot find module './useViewport'`

- [ ] **Step 3: Create the hook**

Create `apps/ui/src/components/kiosk/hooks/useViewport.ts`:

```typescript
import { useState, useEffect } from 'react'

export function useViewport() {
  const [isSidebarMode, setIsSidebarMode] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024,
  )

  useEffect(() => {
    const handleResize = () => setIsSidebarMode(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return { isSidebarMode }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/ui && pnpm test -- useViewport
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/kiosk/hooks/
git commit -m "feat(kiosk): add useViewport hook for sidebar mode detection"
```

---

## Task 2: `CartPanel` variant prop

**Files:**
- Modify: `apps/ui/src/components/kiosk/CartPanel.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/components/kiosk/CartPanel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('./store/kiosk.store', () => ({
  useKioskStore: (selector: (s: any) => any) =>
    selector({ cart: [{ productId: 'p1', menuItemId: undefined, name: 'Burger', price: 10, quantity: 2, notes: '' }] }),
}))

import { CartPanel } from './CartPanel'

const theme = {
  primary: '#059669', primaryDark: '#047857', accent: '#d97706',
  background: '#fffbeb', surface: '#ffffff', text: '#1e293b', textMuted: '#94a3b8',
}

test('overlay variant renders backdrop', () => {
  render(<CartPanel variant="overlay" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(document.querySelector('.fixed.inset-0')).toBeTruthy()
})

test('sidebar variant renders no backdrop', () => {
  render(<CartPanel variant="sidebar" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(document.querySelector('.fixed.inset-0')).toBeNull()
})

test('sidebar variant has no close button', () => {
  render(<CartPanel variant="sidebar" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(screen.queryByRole('button', { name: /×/i })).toBeNull()
})

test('both variants show checkout button', () => {
  const { rerender } = render(
    <CartPanel variant="overlay" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />
  )
  expect(screen.getByRole('button', { name: 'Pagar' })).toBeTruthy()

  rerender(<CartPanel variant="sidebar" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(screen.getByRole('button', { name: 'Pagar' })).toBeTruthy()
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/ui && pnpm test -- CartPanel
```

Expected: tests fail (variant prop not yet implemented).

- [ ] **Step 3: Implement variant in CartPanel**

Replace the full content of `apps/ui/src/components/kiosk/CartPanel.tsx`:

```typescript
import type { KioskTheme } from './types/kiosk.types'
import { useKioskStore } from './store/kiosk.store'
import { OrderSummary } from './OrderSummary'

interface CartPanelProps {
  onClose: () => void
  onCheckout: () => void
  theme: KioskTheme
  variant?: 'overlay' | 'sidebar'
}

function CartFooter({ total, onCheckout, theme }: { total: number; onCheckout: () => void; theme: KioskTheme }) {
  const cart = useKioskStore((s) => s.cart)
  return (
    <div className="p-4 border-t border-slate-200 space-y-3">
      <div className="flex justify-between items-center text-lg font-bold">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
      <button
        onClick={onCheckout}
        disabled={cart.length === 0}
        style={{ backgroundColor: theme.primary }}
        className="w-full py-4 text-white font-bold text-lg rounded-xl transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Pagar
      </button>
    </div>
  )
}

export function CartPanel({ onClose, onCheckout, theme, variant = 'overlay' }: CartPanelProps) {
  const cart = useKioskStore((s) => s.cart)
  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0)

  if (variant === 'sidebar') {
    return (
      <div className="h-full flex flex-col border-l border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold">Tu Pedido</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <OrderSummary items={cart} theme={theme} />
        </div>
        <CartFooter total={total} onCheckout={onCheckout} theme={theme} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold">Tu Pedido</h2>
          <button onClick={onClose} className="text-2xl cursor-pointer border-none bg-transparent leading-none">
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <OrderSummary items={cart} theme={theme} />
        </div>
        <CartFooter total={total} onCheckout={onCheckout} theme={theme} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/ui && pnpm test -- CartPanel
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/kiosk/CartPanel.tsx apps/ui/src/components/kiosk/CartPanel.test.tsx
git commit -m "feat(kiosk): add sidebar variant to CartPanel"
```

---

## Task 3: `KioskApp` layout split

**Files:**
- Modify: `apps/ui/src/components/kiosk/KioskApp.tsx`

No unit test — this is layout/rendering logic covered by visual verification.

- [ ] **Step 1: Update KioskApp with sidebar layout**

Replace the full content of `apps/ui/src/components/kiosk/KioskApp.tsx`:

```typescript
import { useEffect, useMemo } from 'react'
import { useKioskStore } from './store/kiosk.store'
import type { KioskTheme } from './types/kiosk.types'
import { KioskView } from './types/kiosk.types'
import { useViewport } from './hooks/useViewport'
import { LoadingScreen } from './LoadingScreen'
import { SessionClosedScreen } from './SessionClosedScreen'
import { KioskHeader } from './KioskHeader'
import { MenuTabs } from './MenuTabs'
import { ProductGrid } from './ProductGrid'
import { CartFab } from './CartFab'
import { CartPanel } from './CartPanel'
import { OrderConfirmation } from './OrderConfirmation'
import { PaymentMethodSelector } from './PaymentMethodSelector'

const defaultTheme: KioskTheme = {
  primary: '#059669',
  primaryDark: '#047857',
  accent: '#d97706',
  background: '#fffbeb',
  surface: '#ffffff',
  text: '#1e293b',
  textMuted: '#94a3b8',
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return (
    <div className="fixed top-4 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-center font-medium">
      {message}
    </div>
  )
}

type Props = {
  theme?: Partial<KioskTheme>
}

export function KioskApp({ theme: themeProp }: Props) {
  const theme = { ...defaultTheme, ...themeProp }
  const { isSidebarMode } = useViewport()

  const slug = useMemo(
    () => new URLSearchParams(window.location.search).get('slug') ?? '',
    [],
  )

  const isLoading = useKioskStore(s => s.isLoading)
  const sessionOpen = useKioskStore(s => s.sessionOpen)
  const menus = useKioskStore(s => s.menus)
  const activeMenuId = useKioskStore(s => s.activeMenuId)
  const menuSections = useKioskStore(s => s.menuSections)
  const cart = useKioskStore(s => s.cart)
  const view = useKioskStore(s => s.view)
  const confirmedOrder = useKioskStore(s => s.confirmedOrder)
  const errorMessage = useKioskStore(s => s.errorMessage)
  const selectedPayment = useKioskStore(s => s.selectedPayment)
  const customerEmail = useKioskStore(s => s.customerEmail)
  const isSubmitting = useKioskStore(s => s.isSubmitting)

  const init = useKioskStore(s => s.init)
  const selectMenu = useKioskStore(s => s.selectMenu)
  const addToCart = useKioskStore(s => s.addToCart)
  const setView = useKioskStore(s => s.setView)
  const setPayment = useKioskStore(s => s.setPayment)
  const setCustomerEmail = useKioskStore(s => s.setCustomerEmail)
  const placeOrder = useKioskStore(s => s.placeOrder)
  const resetOrder = useKioskStore(s => s.resetOrder)
  const clearError = useKioskStore(s => s.clearError)

  useEffect(() => {
    if (slug) init(slug)
  }, [slug, init])

  if (!slug) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <p style={{ color: theme.textMuted }}>Restaurante no especificado</p>
      </div>
    )
  }

  if (isLoading) return <LoadingScreen theme={theme} />

  if (!sessionOpen) return <SessionClosedScreen theme={theme} />

  if (view === KioskView.CONFIRMATION && confirmedOrder) {
    return (
      <OrderConfirmation
        orderNumber={confirmedOrder.orderNumber}
        items={confirmedOrder.items}
        total={confirmedOrder.totalAmount}
        onNewOrder={resetOrder}
        theme={theme}
      />
    )
  }

  if (view === KioskView.CHECKOUT) {
    return (
      <PaymentMethodSelector
        selectedMethod={selectedPayment}
        onSelect={setPayment}
        customerEmail={customerEmail}
        onEmailChange={setCustomerEmail}
        onConfirm={placeOrder}
        onBack={() => setView(isSidebarMode ? KioskView.MENU : KioskView.CART)}
        isLoading={isSubmitting}
        theme={theme}
      />
    )
  }

  const menuContent = activeMenuId && menuSections[activeMenuId]
    ? <ProductGrid sections={menuSections[activeMenuId]} onAddItem={addToCart} theme={theme} />
    : <div className="text-center text-slate-400 py-12">Selecciona un menú para ver los productos</div>

  const headerTitle = menus.find(m => m.id === activeMenuId)?.name ?? 'Menú'

  if (isSidebarMode) {
    return (
      <div className="h-screen flex flex-row" style={{ backgroundColor: theme.background, color: theme.text }}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <KioskHeader title={headerTitle} theme={theme} />
          <MenuTabs menus={menus} activeMenuId={activeMenuId} onSelect={selectMenu} theme={theme} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {menuContent}
          </main>
        </div>
        <div className="w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col">
          <CartPanel
            variant="sidebar"
            onClose={() => {}}
            onCheckout={() => setView(KioskView.CHECKOUT)}
            theme={theme}
          />
        </div>
        {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: theme.background, color: theme.text }}>
      <KioskHeader title={headerTitle} theme={theme} />
      <MenuTabs menus={menus} activeMenuId={activeMenuId} onSelect={selectMenu} theme={theme} />
      <main className="flex-1 overflow-y-auto p-4">
        {menuContent}
      </main>
      {view === KioskView.MENU && (
        <CartFab
          itemCount={cart.reduce((s, c) => s + c.quantity, 0)}
          onClick={() => setView(KioskView.CART)}
          theme={theme}
        />
      )}
      {view === KioskView.CART && (
        <CartPanel
          onClose={() => setView(KioskView.MENU)}
          onCheckout={() => setView(KioskView.CHECKOUT)}
          theme={theme}
        />
      )}
      {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
    </div>
  )
}
```

Note on the back button in `PaymentMethodSelector`: in sidebar mode, "Volver" goes back to MENU (sidebar always shows cart); in portrait mode it goes back to CART (the overlay).

- [ ] **Step 2: Run all tests to confirm nothing broke**

```bash
cd apps/ui && pnpm test
```

Expected: all existing tests pass (no tests for KioskApp, so just confirm nothing regressed).

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/kiosk/KioskApp.tsx
git commit -m "feat(kiosk): add sidebar layout for screens >= 1024px"
```

---

## Task 4: `ProductGrid` + `ProductCard` responsive scaling

**Files:**
- Modify: `apps/ui/src/components/kiosk/ProductGrid.tsx`
- Modify: `apps/ui/src/components/kiosk/ProductCard.tsx`

- [ ] **Step 1: Update ProductGrid**

Replace the grid div className in `apps/ui/src/components/kiosk/ProductGrid.tsx` (line 29):

```typescript
// Before:
<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">

// After:
<div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
```

- [ ] **Step 2: Update ProductCard**

Replace the full content of `apps/ui/src/components/kiosk/ProductCard.tsx`:

```typescript
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

  const borderClass = priceChanged ? 'border-amber-300' : 'border-slate-200'
  const opacityClass = isOutOfStock ? 'opacity-50' : ''

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden flex flex-col ${borderClass} ${opacityClass}`}
    >
      <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center text-4xl">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          '🍽️'
        )}
      </div>

      <div className="p-3 md:p-4 flex-1 flex flex-col">
        <p className="font-semibold text-sm md:text-base leading-tight mb-1">{title}</p>

        {description && (
          <p className="text-xs md:text-sm text-slate-500 mb-2 line-clamp-2">{description}</p>
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
            className={`font-bold text-base md:text-lg ${priceChanged ? 'text-amber-600' : ''}`}
            style={priceChanged ? undefined : { color: theme.primary }}
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
            className="mt-2 w-full py-2.5 md:py-4 text-white text-sm md:text-base font-medium rounded-lg active:opacity-90 transition-colors cursor-pointer border-none"
            style={{ backgroundColor: theme.primary }}
            onClick={onAdd}
          >
            Agregar
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/ui && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/kiosk/ProductGrid.tsx apps/ui/src/components/kiosk/ProductCard.tsx
git commit -m "feat(kiosk): scale ProductGrid and ProductCard for larger screens"
```

---

## Task 5: `KioskHeader` + `MenuTabs` responsive scaling

**Files:**
- Modify: `apps/ui/src/components/kiosk/KioskHeader.tsx`
- Modify: `apps/ui/src/components/kiosk/MenuTabs.tsx`

- [ ] **Step 1: Update KioskHeader**

Replace the full content of `apps/ui/src/components/kiosk/KioskHeader.tsx`:

```typescript
import type { KioskTheme } from './types/kiosk.types'

interface KioskHeaderProps {
  title: string
  subtitle?: string
  theme: KioskTheme
}

export function KioskHeader({ title, subtitle, theme }: KioskHeaderProps) {
  return (
    <header
      className="px-4 py-3 md:py-4 lg:py-5 shadow-md flex items-center justify-between"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-white truncate text-base md:text-lg lg:text-xl">{title}</span>
        {subtitle && (
          <span className="text-white/70 text-sm md:text-base">{subtitle}</span>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Update MenuTabs**

Replace the full content of `apps/ui/src/components/kiosk/MenuTabs.tsx`:

```typescript
import type { Menu, KioskTheme } from './types/kiosk.types'

interface MenuTabsProps {
  menus: Menu[]
  activeMenuId: string | null
  onSelect: (id: string) => void
  theme: KioskTheme
}

export function MenuTabs({ menus, activeMenuId, onSelect, theme }: MenuTabsProps) {
  return (
    <div className="bg-white border-b overflow-x-auto">
      <div className="flex gap-1 py-2 px-2 md:py-3 md:px-3">
        {menus.length === 0 ? (
          <span className="text-sm md:text-base text-slate-400 px-3 py-2">
            No hay menús disponibles en este momento
          </span>
        ) : (
          menus.map((menu) => {
            const isActive = menu.id === activeMenuId
            return (
              <button
                key={menu.id}
                onClick={() => onSelect(menu.id)}
                className={[
                  'whitespace-nowrap px-4 py-2 md:px-6 md:py-3 rounded-lg text-sm md:text-base font-medium transition-colors cursor-pointer border-none',
                  isActive
                    ? 'text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
                style={isActive ? { backgroundColor: theme.primary } : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                {menu.name}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/ui && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/kiosk/KioskHeader.tsx apps/ui/src/components/kiosk/MenuTabs.tsx
git commit -m "feat(kiosk): scale KioskHeader and MenuTabs for larger screens"
```

---

## Task 6: `PaymentMethodSelector` + `OrderConfirmation` responsive scaling

**Files:**
- Modify: `apps/ui/src/components/kiosk/PaymentMethodSelector.tsx`
- Modify: `apps/ui/src/components/kiosk/OrderConfirmation.tsx`

- [ ] **Step 1: Update PaymentMethodSelector**

Replace the full content of `apps/ui/src/components/kiosk/PaymentMethodSelector.tsx`:

```typescript
import React from 'react'
import type { KioskTheme, PaymentMethod } from './types/kiosk.types'

type PaymentOption = {
  method: PaymentMethod
  icon: string
  label: string
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { method: 'CASH', icon: '💵', label: 'Efectivo' },
  { method: 'CARD', icon: '💳', label: 'Tarjeta' },
  { method: 'DIGITAL_WALLET', icon: '📱', label: 'Billetera Digital' },
]

type Props = {
  selectedMethod: PaymentMethod | null
  onSelect: (m: PaymentMethod) => void
  customerEmail: string
  onEmailChange: (e: string) => void
  onConfirm: () => void
  onBack: () => void
  isLoading: boolean
  theme: KioskTheme
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelect,
  customerEmail,
  onEmailChange,
  onConfirm,
  onBack,
  isLoading,
  theme,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-6">
        <h2 className="text-xl md:text-2xl font-bold text-center">Método de Pago</h2>

        <div className="grid grid-cols-1 gap-3">
          {PAYMENT_OPTIONS.map(({ method, icon, label }) => {
            const isSelected = selectedMethod === method
            return (
              <button
                key={method}
                onClick={() => onSelect(method)}
                className="py-4 md:py-5 px-6 rounded-xl text-lg md:text-xl font-medium flex items-center gap-3 cursor-pointer bg-white transition-all active:scale-95 w-full border-2"
                style={
                  isSelected
                    ? { borderColor: theme.primary, backgroundColor: theme.background }
                    : { borderColor: '#e2e8f0' }
                }
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        <div>
          <label className="block text-sm md:text-base font-medium text-slate-600 mb-1">
            Email (opcional, para recibo)
          </label>
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="tu@email.com"
            className="w-full px-4 py-3 md:py-4 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': theme.primary } as React.CSSProperties}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={!selectedMethod || isLoading}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            {isLoading ? 'Procesando...' : 'Completar Pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update OrderConfirmation**

Replace the full content of `apps/ui/src/components/kiosk/OrderConfirmation.tsx`:

```typescript
import type { CartItem, KioskTheme } from './types/kiosk.types'

type Props = {
  orderNumber: number
  items: CartItem[]
  total: number
  onNewOrder: () => void
  theme: KioskTheme
}

export function OrderConfirmation({ orderNumber, items, total, onNewOrder, theme }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: theme.primary }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-8 md:p-10 text-center space-y-6">
        <div className="text-6xl md:text-7xl">✅</div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800">¡Pedido Confirmado!</h2>

        <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: `${theme.primary}15` }}>
          <p className="text-sm md:text-base font-medium" style={{ color: theme.primary }}>
            Tu número de pedido
          </p>
          <p className="text-6xl md:text-8xl font-black my-2" style={{ color: theme.primaryDark }}>
            #{orderNumber}
          </p>
        </div>

        <div className="text-left text-sm md:text-base text-slate-600 space-y-1">
          {items.map((item) => (
            <div key={`${item.productId}:${item.menuItemId ?? ''}`} className="flex justify-between">
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-slate-200 pt-2 mt-2">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={onNewOrder}
          style={{ backgroundColor: theme.primary }}
          className="w-full py-4 md:py-5 text-white font-bold text-lg md:text-xl rounded-xl cursor-pointer border-none active:opacity-90"
        >
          Nuevo Pedido
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/ui && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/kiosk/PaymentMethodSelector.tsx apps/ui/src/components/kiosk/OrderConfirmation.tsx
git commit -m "feat(kiosk): scale PaymentMethodSelector and OrderConfirmation for larger screens"
```

---

## Task 7: `LoadingScreen`, `SessionClosedScreen`, `CartFab` responsive scaling

**Files:**
- Modify: `apps/ui/src/components/kiosk/LoadingScreen.tsx`
- Modify: `apps/ui/src/components/kiosk/SessionClosedScreen.tsx`
- Modify: `apps/ui/src/components/kiosk/CartFab.tsx`

- [ ] **Step 1: Update LoadingScreen**

Replace the full content of `apps/ui/src/components/kiosk/LoadingScreen.tsx`:

```typescript
import type { KioskTheme } from './types/kiosk.types'

export function LoadingScreen({ theme }: { theme: KioskTheme }) {
  return (
    <div className="h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
      <p className="text-base md:text-lg" style={{ color: theme.textMuted }}>Cargando...</p>
    </div>
  )
}
```

- [ ] **Step 2: Update SessionClosedScreen**

Replace the full content of `apps/ui/src/components/kiosk/SessionClosedScreen.tsx`:

```typescript
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
```

- [ ] **Step 3: Update CartFab**

Replace the full content of `apps/ui/src/components/kiosk/CartFab.tsx`:

```typescript
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
          className="rounded-full w-16 h-16 md:w-20 md:h-20 shadow-lg flex items-center justify-center text-2xl md:text-3xl active:scale-95 transition-transform cursor-pointer border-none"
          style={{ backgroundColor: theme.primary }}
          aria-label={`Ver carrito (${itemCount} productos)`}
        >
          <span className="text-white">🛒</span>
        </button>
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 md:w-7 md:h-7 flex items-center justify-center font-bold">
          {itemCount}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/ui && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/kiosk/LoadingScreen.tsx apps/ui/src/components/kiosk/SessionClosedScreen.tsx apps/ui/src/components/kiosk/CartFab.tsx
git commit -m "feat(kiosk): scale LoadingScreen, SessionClosedScreen, and CartFab for larger screens"
```

---

## Visual Verification Checklist

After all tasks are complete, start the dev server (`cd apps/ui && pnpm dev`) and verify at `http://localhost:4321/kiosk?slug=<your-slug>`:

- [ ] **Mobile (375px):** 2-col product grid, CartFab visible, bottom sheet opens on tap
- [ ] **Tablet portrait (768px):** 3-col grid, CartFab visible, bottom sheet overlay
- [ ] **Tablet landscape / kiosk ≥1024px:** sidebar appears on right, no CartFab, cart always visible
- [ ] **Large screen (1280px+):** 4-col grid, wider sidebar (420px)
- [ ] **Payment flow portrait:** "Volver" goes back to cart overlay
- [ ] **Payment flow sidebar:** "Volver" goes back to menu view (cart stays visible in sidebar)
- [ ] **Resize browser from 768 to 1280:** layout switches between portrait and sidebar without reload
