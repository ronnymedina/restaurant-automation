# Kiosk Category Dividers — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

## Problem

The category headers in the kiosk product grid (`ProductGrid.tsx`) are not visually distinct enough. The current style (`text-xs text-slate-400`) renders small (12px) gray text with no separator, making it hard to tell where one section ends and another begins.

## Solution

Replace the current `h3` with a centered-divider pattern: two horizontal gray lines flanking the category name.

### Visual

```
────────────── ENTRADAS ──────────────
[ card ]  [ card ]  [ card ]

────────────── PLATOS PRINCIPALES ────
[ card ]  [ card ]  [ card ]
```

### Tailwind implementation

```tsx
<div className="flex items-center gap-3 mt-8 mb-4 first:mt-0">
  <div className="flex-1 h-px bg-slate-200" />
  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
    {sectionName}
  </span>
  <div className="flex-1 h-px bg-slate-200" />
</div>
```

### Changes vs current

| Property | Before | After |
|---|---|---|
| Tag | `h3` | `div` + inner `span` |
| Font size | `text-xs` (12px) | `text-[11px]` |
| Text color | `text-slate-400` | `text-slate-500` |
| Margin top | `mt-6` (24px) | `mt-8` (32px) |
| Margin bottom | `mb-3` (12px) | `mb-4` (16px) |
| Separator | none | `h-px bg-slate-200` lines |
| Color scheme | — | Neutral gray (no theme color) |

## Scope

- **One file changed:** `apps/ui/src/components/kiosk/ProductGrid.tsx` line 26
- No API changes, no new dependencies, no test changes required
