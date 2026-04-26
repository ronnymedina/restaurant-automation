# Kiosk React Refactor — Design Spec

**Date:** 2026-04-26  
**Status:** Approved

## Overview

Refactor `apps/ui/src/pages/kiosk/index.astro` from a single 540-line Astro file with vanilla JS DOM manipulation into a fully modular React component architecture. All components are responsive (mobile, tablet, large screen, vertical) and theme-customizable via a `KioskTheme` object.

State is managed with Zustand. The WebSocket integration is intentionally excluded from this refactor (will be replaced with Server-Sent Events in a follow-up).

---

## Architecture

`pages/kiosk/index.astro` becomes a minimal shell that mounts `<KioskApp client:only="react" />` and passes the slug (read from `?slug=` query param). All logic lives in React.

```
pages/kiosk/index.astro  (shell only)
  └─ KioskApp             (root, reads slug, initializes store)
       ├─ KioskHeader
       ├─ LoadingScreen
       ├─ SessionClosedScreen
       ├─ MenuTabs
       ├─ ProductGrid
       │    └─ ProductCard[]
       ├─ CartFab
       ├─ CartPanel          (overlay)
       │    ├─ OrderSummary
       │    │    └─ OrderSummaryItem[]  (QuantityControls + ProductNoteForm)
       │    └─ CartFooter
       ├─ PaymentMethodSelector  (overlay)
       └─ OrderConfirmation      (overlay)
```

---

## File Structure

```
apps/ui/src/components/kiosk/
  KioskApp.tsx
  KioskHeader.tsx
  MenuTabs.tsx
  ProductGrid.tsx
  ProductCard.tsx
  CartFab.tsx
  CartPanel.tsx
  OrderSummary.tsx
  OrderSummaryItem.tsx
  QuantityControls.tsx
  ProductNoteForm.tsx
  PaymentMethodSelector.tsx
  OrderConfirmation.tsx
  store/
    kiosk.store.ts
  types/
    kiosk.types.ts
```

---

## Theme System

All components receive a `theme` prop of type `KioskTheme`. The default theme matches the current emerald/slate palette.

```typescript
type KioskTheme = {
  primary: string      // main brand color (buttons, active states)
  primaryDark: string  // hover/active/pressed variant
  accent: string       // badges, price-change alerts
  background: string   // page background
  surface: string      // cards, panels, overlays
  text: string         // primary text
  textMuted: string    // secondary/placeholder text
}

const defaultTheme: KioskTheme = {
  primary: '#059669',
  primaryDark: '#047857',
  accent: '#d97706',
  background: '#fffbeb',
  surface: '#ffffff',
  text: '#1e293b',
  textMuted: '#94a3b8',
}
```

`KioskApp` defines the default theme and passes it down to all child components. Consumers can override any key.

---

## Zustand Store

Single store `useKioskStore` in `store/kiosk.store.ts`.

### State shape

```typescript
type KioskStore = {
  // Session
  slug: string
  sessionOpen: boolean
  isLoading: boolean

  // Menus
  menus: Menu[]
  activeMenuId: string | null
  menuSections: Record<string, MenuItem[]>  // keyed by menuId

  // Cart
  cart: CartItem[]

  // Checkout
  selectedPayment: PaymentMethod | null
  customerEmail: string
  isSubmitting: boolean

  // UI state
  view: 'menu' | 'cart' | 'checkout' | 'confirmation'
  confirmedOrder: ConfirmedOrder | null
  errorMessage: string | null

  // Price change tracking
  cartPriceSnapshot: Map<string, number> | null
}
```

### Actions

```typescript
  // Initialization
  init(slug: string): Promise<void>
  loadMenus(): Promise<void>
  selectMenu(menuId: string): Promise<void>

  // Cart
  addToCart(item: AddToCartPayload): void
  updateQuantity(productId: string, menuItemId: string | undefined, delta: number): void
  updateNotes(productId: string, menuItemId: string | undefined, notes: string): void
  clearCart(): void

  // Checkout
  setPayment(method: PaymentMethod): void
  setCustomerEmail(email: string): void
  placeOrder(): Promise<void>
  resetOrder(): void

  // UI
  setView(view: KioskView): void
  clearError(): void
```

---

## Component Contracts

### `KioskApp`
- Reads `?slug=` from `window.location.search`
- Calls `store.init(slug)` on mount
- Renders the correct screen based on `isLoading`, `sessionOpen`, and `view`
- Defines and passes `theme` to all children
- **Props:** `theme?: Partial<KioskTheme>`

### `KioskHeader`
- Shows restaurant/menu name, truncated
- **Props:** `title: string; subtitle?: string; theme: KioskTheme`

### `MenuTabs`
- Horizontal scrollable tab bar
- Active tab highlighted with `theme.primary`
- **Props:** `menus: Menu[]; activeMenuId: string | null; onSelect: (id: string) => void; theme: KioskTheme`

### `ProductGrid`
- Renders sections with heading + responsive grid
- Grid: `grid-cols-2` on mobile, `grid-cols-3` on md+, `grid-cols-4` on xl+
- **Props:** `sections: Record<string, MenuItem[]>; theme: KioskTheme`

### `ProductCard`
- Shows image (fallback icon), name, description, price, stock badge
- Highlights price changes with amber border and strikethrough
- **Props:** `title: string; description?: string; price: number; imageUrl?: string; stockStatus: 'available' | 'low_stock' | 'out_of_stock'; onAdd?: () => void; priceChanged?: boolean; oldPrice?: number; theme: KioskTheme`

### `CartFab`
- Fixed bottom-right floating button
- Shows item count badge; hidden when cart is empty
- **Props:** `itemCount: number; onClick: () => void; theme: KioskTheme`

### `CartPanel`
- Bottom sheet overlay (`max-h-[85vh]`, rounded top corners)
- Contains `OrderSummary` + total + checkout button
- **Props:** `onClose: () => void; onCheckout: () => void; theme: KioskTheme`

### `OrderSummary`
- Scrollable list of `OrderSummaryItem` components
- Empty state message when cart is empty
- **Props:** `items: CartItem[]; theme: KioskTheme`

### `OrderSummaryItem`
- Shows product name, price, `QuantityControls`, `ProductNoteForm`
- Amber highlight when price was updated
- **Props:** `item: CartItem; theme: KioskTheme`

### `QuantityControls`
- Circle `-` and `+` buttons, quantity display between them
- Decrementing to 0 removes the item
- **Props:** `value: number; onIncrease: () => void; onDecrease: () => void; theme: KioskTheme`

### `ProductNoteForm`
- Single text input: "Notas (ej: sin cebolla)"
- **Props:** `value: string; onChange: (val: string) => void; theme: KioskTheme`

### `PaymentMethodSelector`
- Full-screen centered modal
- Three options: CASH, CARD, DIGITAL_WALLET with icon + label
- Optional email input for receipt
- Confirm button disabled until method selected
- **Props:** `selectedMethod: PaymentMethod | null; onSelect: (m: PaymentMethod) => void; customerEmail: string; onEmailChange: (e: string) => void; onConfirm: () => void; onBack: () => void; isLoading: boolean; theme: KioskTheme`

### `OrderConfirmation`
- Full-screen emerald overlay
- Large order number, item summary, "Nuevo Pedido" button
- **Props:** `orderNumber: number; items: CartItem[]; total: number; onNewOrder: () => void; theme: KioskTheme`

---

## Responsive Breakpoints

| Screen | Layout |
|--------|--------|
| Mobile (`< 768px`) | `grid-cols-2`, bottom-sheet cart, compact header |
| Tablet (`768px–1279px`) | `grid-cols-3`, same overlays |
| Desktop (`≥ 1280px`) | `grid-cols-4`, overlays centered with max-width |
| Vertical tall (`aspect-ratio < 0.7`) | Keeps bottom-sheet pattern, no layout change needed |

---

## Dependencies to Add

- `zustand` — add to `apps/ui/package.json`

---

## Preserved Behavior

All existing kiosk behavior is preserved:
- Session status check on init (closed → `SessionClosedScreen`)
- Menu loading + tab switching
- Cart add/remove/quantity/notes
- Price-change detection and cart sync on order rejection (400 response)
- Stock status display (`out_of_stock` disables Add button, `low_stock` shows badge)
- Payment method selection + optional customer email
- Order placement via `POST /v1/kiosk/:slug/orders`
- Order confirmation with order number + summary
- Error toast notifications
- "Nuevo Pedido" resets all state

## Out of Scope

- WebSocket real-time updates (will be replaced with SSE in a follow-up)
- Any new API endpoints
- Dashboard changes
