# Spec: Restaurant Settings Form — React Component

**Date:** 2026-06-02  
**Branch:** spec/restaurant-settings-update  
**Scope:** UI only (`apps/ui`)

## Problem

The settings page (`/dash/settings`) is implemented as a vanilla JS inline script inside an Astro file. The currency field is a free-form text input requiring the user to know and type an ISO 4217 code manually. The goal is to:

1. Convert the form to a React component (consistent with the rest of the dashboard).
2. Make currency a read-only display field derived from the restaurant's country (set at onboarding, never editable in settings).

## Decision: Currency

Currency is **read-only** and derived from country. It is displayed in the info section below the form — not editable, not sent in the PATCH. The country→currency relationship is established at onboarding time by the API.

## Architecture

**New file:** `src/components/dash/RestaurantSettingsForm.tsx`  
**Modified:** `src/pages/dash/settings.astro` — becomes a thin wrapper (same pattern as `categories.astro`)

### Data layer
- Load: `useRestaurantSettings()` hook (`src/lib/restaurant-settings.ts`) — already exists, uses `@tanstack/react-query`
- Mutation: direct `apiFetch` PATCH to `/v1/restaurants/settings` — same pattern as `CategoriesTable`
- Timezone options: `countries-and-timezones` (already installed) — filtered by `data.country`

### Form library
`react-hook-form` + `zod` (both already installed).

## Form Fields

### Editable (inside `<form>`)

| Field | Type | Validation |
|---|---|---|
| Nombre del restaurante | `text` | required, 1–255 chars |
| Zona horaria | `<select>` | options filtered by country via `countries-and-timezones` |
| Formato decimal | radio | `.` or `,` |

### Read-only info section (below form, outside `<form>`)

| Field | Display |
|---|---|
| Slug | text |
| País | text |
| Moneda | text (e.g. "CLP") |

## Layout

```
┌──────────────────────────────────────────┐
│  Configuración                           │
├──────────────────────────────────────────┤
│  FORMULARIO                              │
│  Nombre del restaurante                  │
│  [_________________________________]     │
│                                          │
│  Zona horaria                            │
│  [▼ America/Santiago                ]    │
│                                          │
│  Formato decimal                         │
│  ○ Punto (1,234.56)  ● Coma (1.234,56)  │
│                                          │
│  [ Guardar ]   ✓ Configuración guardada  │
├──────────────────────────────────────────┤
│  INFORMACIÓN DEL RESTAURANTE             │
│  Slug        mi-restaurante              │
│  País        CL                          │
│  Moneda      CLP                         │
└──────────────────────────────────────────┘
```

## PATCH payload

Only changed fields are sent. Currency, slug, and country are **never included** in the PATCH:

```ts
{ name?, timezone?, decimalSeparator? }
```

## Zod schema

```ts
const schema = z.object({
  name: z.string().min(1).max(255),
  timezone: z.string().min(1),
  decimalSeparator: z.enum(['.', ',']),
});
```

## States

- **Loading**: skeleton or spinner while settings load
- **Error on load**: error message, no form rendered
- **Success save**: inline success message, auto-hides after 4s
- **Error on save**: inline error message with API error text
- **Save in progress**: button disabled + "Guardando..."

## Files changed

| File | Action |
|---|---|
| `src/components/dash/RestaurantSettingsForm.tsx` | Create |
| `src/pages/dash/settings.astro` | Replace inline script with `<RestaurantSettingsForm client:load />` |

## Out of scope

- Making country editable
- Making currency editable
- Country→currency mapping logic (lives in API/onboarding, not this form)
- Adding `currency-codes` to the UI
