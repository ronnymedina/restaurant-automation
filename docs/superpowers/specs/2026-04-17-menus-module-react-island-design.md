# Menus Module — React Island Migration Design

**Date:** 2026-04-17
**Scope:** Migrate `menus.astro` and `menus/detail.astro` to React islands with TanStack Query, reusable commons components, and paginated API endpoint.

---

## 1. Motivation

The menus module currently uses vanilla DOM manipulation via inline `<script>` blocks in Astro pages — the same pattern that was already replaced in the products module. This migration:

- Brings menus in line with the React island pattern established by products
- Enables TanStack Query for server state (caching, invalidation, loading/error states)
- Separates concerns into focused components
- Adds a reusable `IconButton` component to commons for action columns

---

## 2. Architecture

### File structure

```
apps/ui/src/
├── components/
│   ├── commons/
│   │   └── IconButton.tsx              ← new reusable icon button (Heroicons + size prop)
│   └── dash/
│       └── menus/                      ← new directory
│           ├── MenusIsland.tsx         ← island for menus.astro
│           ├── MenuForm.tsx            ← create/edit menu form
│           ├── MenuDetailIsland.tsx    ← island for menus/detail.astro
│           ├── MenuItemsSection.tsx    ← renders one section with its items table
│           └── ProductPickerModal.tsx  ← product selection modal for bulk add
├── lib/
│   └── menus-api.ts                    ← fetch functions, types, query keys
└── pages/dash/
    ├── menus.astro                     ← simplified: mounts MenusIsland only
    └── menus/
        └── detail.astro               ← simplified: mounts MenuDetailIsland only
```

### Astro pages after migration

Both pages become thin shells — no inline script, no logic:

```astro
---
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import MenusIsland from '../../components/dash/menus/MenusIsland';
---
<DashboardLayout>
  <MenusIsland client:load />
</DashboardLayout>
```

---

## 3. API changes (api-core)

### `GET /v1/menus` — add pagination

Currently returns a plain array. Change to standard paginated format so `TableWithFetch` can be used:

```json
{
  "data": [ { "id": "...", "name": "Almuerzo", "active": true, "itemsCount": 5, ... } ],
  "meta": { "page": 1, "totalPages": 1, "total": 3, "limit": 50 }
}
```

- Default `limit: 50` (restaurants typically have few menus)
- Accept optional `page` and `limit` query params
- Update `MenuListSerializer` — field is already `itemsCount` (no change needed there)
- Update e2e tests to assert the new response shape

---

## 4. Commons — `IconButton.tsx`

Reusable icon button for action columns across the dashboard.

```tsx
interface IconButtonProps {
  icon: 'pencil' | 'trash' | 'list-bullet' | 'eye'  // extend as needed
  label: string        // aria-label and tooltip title
  onClick?: () => void
  variant?: 'default' | 'danger' | 'primary'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}
```

- Renders Heroicons SVG (outline style) inside a transparent button
- `label` used as `aria-label` and `title` for accessibility/tooltip
- Size maps to icon pixel size (sm=16px, md=20px, lg=24px)
- Variant controls hover color (default=slate, danger=red, primary=indigo)

---

## 5. `menus-api.ts`

```typescript
// Types
interface Menu {
  id: string
  name: string
  active: boolean
  startTime: string | null
  endTime: string | null
  daysOfWeek: string | null
  itemsCount: number
}

interface MenuWithItems extends Menu {
  items: MenuItem[]
}

interface MenuItem {
  id: string
  productId: string
  sectionName: string | null
  order: number
  product: { name: string; price: number; category?: { name: string } }
}

// Query keys
export const MENUS_QUERY_KEY = '/v1/menus'

// Functions
fetchMenus(params?)          → Promise<PaginatedResponse<Menu>>
fetchMenuById(id)            → Promise<MenuWithItems>
createMenu(dto)              → Promise<Menu>
updateMenu(id, dto)          → Promise<Menu>
deleteMenu(id)               → Promise<void>
bulkCreateMenuItems(menuId, { productIds, sectionName }) → Promise<{ created: number }>
updateMenuItem(menuId, itemId, dto) → Promise<MenuItem>
deleteMenuItem(menuId, itemId)      → Promise<void>
```

---

## 6. Components

### `MenusIsland.tsx`

Mirrors `ProductsIsland.tsx`:

- Wraps `QueryClientProvider`
- `useQueryClient` for cache invalidation
- Table columns: Nombre, Horario, Días, Activo, Acciones
- **Remove** the "# Items" column (not relevant in list view per spec)
- Actions column uses `IconButton`: pencil (edit), trash (delete), list-bullet (→ detail page link)
- Inline `MenuForm` shown on create/edit
- Uses `TableWithFetch` (now that endpoint is paginated)

### `MenuForm.tsx`

Props: `initialData?: Menu`, `onSuccess(): void`, `onCancel(): void`

Fields:
- Nombre (required)
- Toggle "Disponible todo el horario" → shows/hides hora inicio/fin
- Hora inicio, hora fin (time inputs)
- Días de semana (checkboxes: MON–SUN)
- Activo (checkbox)

Mutations via TanStack Query `useMutation` calling `createMenu` or `updateMenu`.
Uses `Button` from commons.

### `MenuDetailIsland.tsx`

- Reads `menuId` from `new URLSearchParams(window.location.search).get('id')`
- `useQuery` to fetch `MenuWithItems`
- Renders header (name, schedule, days, active badge)
- Button "+ Nueva sección" → shows inline section name form
- After section name confirmed, opens `ProductPickerModal`
- Maps items grouped by `sectionName` → renders `MenuItemsSection` per group

### `MenuItemsSection.tsx`

Props: `menuId`, `sectionName`, `items: MenuItem[]`, `onAddProducts()`, `onRefresh()`

- Header with section name + "Agregar productos" button
- Table columns: Orden, Producto, Categoría, Precio, Acciones
- Actions: `IconButton` pencil (edit inline sectionName), `IconButton` trash (delete item)
- Edit opens a small inline form to change `sectionName`
- Delete calls `deleteMenuItem` + `onRefresh`

### `ProductPickerModal.tsx`

Props: `menuId`, `sectionName`, `onConfirm()`, `onCancel()`

- `useQuery` for products list (`GET /v1/products?limit=100`)
- Search filter input
- Checkbox list of products with name + price
- Selected count badge
- Confirm calls `bulkCreateMenuItems` then `onConfirm()`
- Uses `Button` from commons

---

## 7. Testing

### api-core e2e

- Update existing menus e2e tests to assert `{ data: [...], meta: {...} }` shape on `GET /v1/menus`
- Assert `meta.total`, `meta.page`, `meta.totalPages` are present
- Assert `itemsCount` field exists on each menu in `data`

### UI unit tests

- `IconButton.test.tsx` — renders correct icon, fires onClick, applies variant/size classes
- `MenuForm.test.tsx` — renders fields, submits create, submits edit with initialData
- `MenusIsland.test.tsx` — renders table with mocked query, triggers edit/delete
- `MenuDetailIsland.test.tsx` — renders sections from mocked menu-with-items response

Follow the patterns in `ProductsIsland.test.tsx` and `ProductForm.test.tsx`.

---

## 8. Out of scope

- Changing the URL structure of `detail.astro` (project uses static export, query params only)
- Reordering menu items (drag-and-drop)
- Any changes to the kiosk-facing menus endpoint
