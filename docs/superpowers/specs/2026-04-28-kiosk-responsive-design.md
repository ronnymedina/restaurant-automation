# Kiosk Responsive Design Spec

**Date:** 2026-04-28
**Status:** Approved

## Overview

Make the kiosk fully responsive across all target devices: physical kiosk touchscreens (portrait and landscape), mounted tablets, and mobile phones. The React component architecture from the previous refactor is complete and correct — this spec covers CSS scaling and a layout split between portrait (bottom-sheet cart) and sidebar (persistent cart panel) modes.

**Device priority:**
1. Physical kiosk screen — horizontal and vertical (touchscreen 21"+ or mounted tablet 10–12")
2. Tablets
3. Mobile

---

## Layout Strategy

### Sidebar mode criterion

A single width threshold determines the layout mode: **`window.innerWidth >= 1024px` → sidebar mode**.

Orientation (portrait/landscape) is intentionally ignored. Rationale:
- A 21" portrait touchscreen is ~1080px wide → sidebar is appropriate even in portrait
- A 10" tablet in landscape is ~1024px wide → sidebar is appropriate
- A 10" tablet in portrait is ~768px wide → bottom sheet is correct
- Mobile → bottom sheet is correct

### Portrait mode (`isSidebarMode = false`, width < 1024px)

```
h-screen flex-col
├── KioskHeader
├── MenuTabs
├── main (flex-1, overflow-y-auto, p-4)
│    └── ProductGrid
├── CartFab (fixed bottom-right, hidden when cart empty)
└── CartPanel variant="overlay" (rendered when view === CART)
```

### Sidebar mode (`isSidebarMode = true`, width ≥ 1024px)

```
h-screen flex-row
├── left column (flex-1, flex-col, overflow-hidden)
│    ├── KioskHeader
│    ├── MenuTabs
│    └── main (flex-1, overflow-y-auto, p-4)
│         └── ProductGrid
└── right column (w-[380px] xl:w-[420px], flex-col, border-l)
     └── CartPanel variant="sidebar" (always visible, no CartFab)
```

`PaymentMethodSelector` and `OrderConfirmation` remain full-screen views unaffected by layout mode.

---

## New File

### `components/kiosk/hooks/useViewport.ts`

```typescript
export function useViewport() {
  // Returns { isSidebarMode: boolean }
  // isSidebarMode: window.innerWidth >= 1024
  // Listens to resize events, updates reactively
}
```

---

## Component Changes

### `KioskApp`

- Import `useViewport`
- In sidebar mode: render `flex-row` root, render `CartPanel variant="sidebar"` in right column, no `CartFab`
- In portrait mode: render `flex-col` root (current behavior), `CartFab` + `CartPanel variant="overlay"` when `view === CART`

### `CartPanel`

Add `variant: 'overlay' | 'sidebar'` prop (default: `'overlay'`).

| `variant` | Behavior |
|---|---|
| `overlay` | `fixed inset-0` backdrop + `absolute bottom-0 left-0 right-0` bottom sheet — current behavior |
| `sidebar` | No backdrop, `h-full flex flex-col border-l border-slate-200 bg-white` — fills parent column |

In sidebar mode, the close button is hidden (there is nothing to close). The checkout button behaves identically in both variants.

### `CartFab`

Hidden (`hidden`) when `isSidebarMode` is true. Size: `w-14 h-14 md:w-16 md:h-16`.

### `ProductGrid`

Grid columns: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4`

### `ProductCard`

| Element | Current | Updated |
|---|---|---|
| Image | `aspect-[4/3]` | unchanged |
| Title | `text-sm` | `text-sm md:text-base` |
| Description | `text-xs` | `text-xs md:text-sm` |
| Price | `text-sm font-bold` | `text-base md:text-lg font-bold` |
| Add button | `py-2.5` | `py-2.5 md:py-4` (≥44px touch target on md+) |
| Card padding | `p-3` | `p-3 md:p-4` |

### `KioskHeader`

| Element | Current | Updated |
|---|---|---|
| Padding | `px-4 py-3` | `px-4 py-3 md:py-4 lg:py-5` |
| Title | `font-bold text-white` | `font-bold text-white text-base md:text-lg lg:text-xl` |
| Subtitle | `text-sm` | `text-sm md:text-base` |

### `MenuTabs`

| Element | Current | Updated |
|---|---|---|
| Tab padding | `px-4 py-2` | `px-4 py-2 md:px-6 md:py-3` |
| Tab text | `text-sm` | `text-sm md:text-base` |
| Container padding | `py-2 px-2` | `py-2 px-2 md:py-3 md:px-3` |

### `PaymentMethodSelector`

| Element | Current | Updated |
|---|---|---|
| Card max-width | `max-w-md` | `max-w-md lg:max-w-lg` |
| Payment buttons | `py-4` | `py-4 md:py-5` |
| Title | `text-xl` | `text-xl md:text-2xl` |

### `OrderConfirmation`

| Element | Updated |
|---|---|
| Order number | `text-4xl md:text-6xl lg:text-8xl` |
| Supporting text | scales with `md:` and `lg:` prefixes |
| "Nuevo Pedido" button | `py-4 md:py-5 text-lg md:text-xl` |

### `LoadingScreen` / `SessionClosedScreen`

Center content with `max-w-sm md:max-w-md mx-auto`, scale text with `md:` prefixes.

---

## Breakpoint Summary

| Width | Layout | Product grid | Cart |
|---|---|---|---|
| `< 640px` | portrait | 2 col | bottom sheet overlay |
| `640–1023px` | portrait | 3 col | bottom sheet overlay |
| `≥ 1024px` | sidebar | 3–4 col | persistent right panel |

`xl:grid-cols-4` kicks in at 1280px (large touchscreens and wide tablets in landscape).

---

## Out of Scope

- WebSocket / SSE changes
- Theme customization beyond existing `KioskTheme`
- Any new API endpoints
- Dashboard changes
