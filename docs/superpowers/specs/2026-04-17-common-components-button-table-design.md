# Spec: Common React Components — Button, Table, TableWithFetch

**Date:** 2026-04-17
**Scope:** `apps/ui` — categories page migration as proof of concept

---

## Overview

Introduce a `src/components/commons/` folder with reusable React components. This spec covers the first three: `Button`, `Table`, and `TableWithFetch`. The categories dashboard page (`/dash/categories`) is the first page to migrate from the existing Astro + vanilla JS pattern to these new components.

---

## Dependencies

Add to `apps/ui/package.json`:

- `@tanstack/react-table` — headless table logic (sorting, column defs, cell renderers)
- `@tanstack/react-query` — server state management (caching, loading, error, refetch)

---

## File Structure

```
apps/ui/src/
  components/
    commons/
      Button.tsx
      Table.tsx
      TableWithFetch.tsx
      Providers.tsx          ← QueryClientProvider wrapper
  pages/
    dash/
      categories.astro       ← migrated to use new components
```

---

## Component: `Providers`

A React island that wraps children with `QueryClientProvider`. Mounted once in `DashboardLayout.astro` with `client:load`.

```tsx
// Global QueryClient config
new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})
```

`DashboardLayout.astro` wraps its `<slot />` inside `<Providers client:load>`.

---

## Component: `Button`

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'danger' \| 'warning'` | `'primary'` | Controls color scheme |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Controls padding and font size |
| `className` | `string` | `''` | Appended to base classes — allows Tailwind overrides |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | Pass `'submit'` for form submission |
| `...rest` | `ButtonHTMLAttributes` | — | All native button props (onClick, disabled, etc.) |

### Variant styles

| Variant | Base color |
|---|---|
| `primary` | `bg-indigo-600 hover:bg-indigo-700 text-white` |
| `secondary` | `bg-slate-100 hover:bg-slate-200 text-slate-700` |
| `danger` | `bg-red-600 hover:bg-red-700 text-white` |
| `warning` | `bg-amber-500 hover:bg-amber-600 text-white` |

### Size styles

| Size | Classes |
|---|---|
| `sm` | `px-3 py-1.5 text-xs` |
| `md` | `px-4 py-2 text-sm` |
| `lg` | `px-5 py-2.5 text-base` |

Base classes always applied: `font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`

---

## Component: `Table`

Purely presentational. Receives data and column definitions, renders the table with optional pagination. No data fetching.

### Props

| Prop | Type | Required | Notes |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | yes | TanStack column definitions |
| `data` | `T[]` | yes | Row data |
| `isLoading` | `boolean` | no | Shows skeleton/loading row |
| `emptyMessage` | `string` | no | Default: `'No hay registros'` |
| `pagination` | `PaginationProps` | no | If absent, no pagination rendered |

```ts
interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}
```

### Custom cells

Custom cell renderers are defined inline in the `columns` array passed by the parent:

```tsx
{
  id: 'actions',
  header: 'Acciones',
  cell: ({ row }) => (
    <Button variant="danger" size="sm" onClick={() => handleDelete(row.original.id)}>
      Eliminar
    </Button>
  ),
}
```

### Pagination

Renders page buttons below the table. Same visual style as the existing `pagination.ts` helper (indigo active button, slate default). Replaces the `renderPagination` vanilla JS function for React pages.

---

## Component: `TableWithFetch`

Wrapper around `Table` that owns data fetching via TanStack Query. Expects the API to return `{ data: T[], meta: { page, totalPages, total, limit } }` — the existing backend format.

### Props

| Prop | Type | Required | Notes |
|---|---|---|---|
| `url` | `string` | yes | API path, e.g. `/v1/categories` |
| `columns` | `ColumnDef<T>[]` | yes | Passed through to `Table` |
| `params` | `Record<string, string>` | no | Extra query params (e.g. `{ limit: '20' }`) |
| `emptyMessage` | `string` | no | Passed through to `Table` |

### Behavior

- Uses `useQuery` with `queryKey: [url, params, page]`
- `queryFn` calls `apiFetch(url + queryString)` using the existing auth-aware fetch wrapper
- Manages `page` state internally with `useState`
- On error shows an error row inside the table (same style as `setTableError`)
- Pagination is wired automatically from `meta.totalPages`

---

## Categories Page Migration

`pages/dash/categories.astro` is refactored to:

1. Remove the entire `<script>` block (vanilla JS fetch, event binding, pagination)
2. Remove `DataTable.astro` import
3. Mount a single React island `<CategoriesTable client:load />` or inline JSX with `TableWithFetch`
4. Keep the create/edit form as a React component inline or as a separate `CategoryForm.tsx`

### Bug fix: `invalidDate`

The `createdAt` field from `/v1/categories` may be missing or null. Fix with a safe formatter:

```ts
const formatDate = (val: string | null | undefined) =>
  val ? new Date(val).toLocaleDateString('es-MX') : '—';
```

---

## Out of Scope

- Migration of other pages (products, orders, users, menus) — done in future iterations
- Sorting, filtering, row selection in Table — not needed yet, TanStack Table supports it when required
- The existing `DataTable.astro` is left in place until all pages migrate

---

## Common Components Inventory

See `docs/common-components.md` for the full list of planned common components.
