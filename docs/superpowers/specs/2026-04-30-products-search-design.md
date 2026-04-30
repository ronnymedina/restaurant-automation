# Products Search — Design Spec

**Date:** 2026-04-30  
**Status:** Approved

## Overview

Add server-side search to the products dashboard view. A single debounced input lets staff find products by name or SKU without loading the full catalog. The feature spans three layers: database indexes, API query param, and UI input.

## Database

One change to both schemas (`schema.prisma` and `schema.postgresql.prisma`):

**Replace the single-column index with a composite:**
```prisma
// Before
@@index([deletedAt])

// After
@@index([restaurantId, deletedAt])
```
Every product query always filters by `restaurantId` first. The existing `deletedAt`-only index is effectively unused. With the composite index, PostgreSQL narrows the dataset to the restaurant's products efficiently, and the subsequent `ILIKE` runs on that already-small set.

**Future optimization (when there are real production clients):** GIN trigram indexes on `name` and `sku` via `pg_trgm` extension. Deferred — no production load to justify it yet.

## API (NestJS)

### New DTO — `ProductQueryDto`

Located in `apps/api-core/src/products/dto/product-query.dto.ts`:

```typescript
export class ProductQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
```

### Repository — `findByRestaurantIdPaginated`

Accepts an optional `search` param and adds an `OR` clause only when present:

```typescript
where: {
  restaurantId,
  deletedAt: null,
  ...(search ? {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { sku:  { contains: search, mode: 'insensitive' } },
    ]
  } : {}),
}
```

`mode: 'insensitive'` maps to `ILIKE` in PostgreSQL. PostgreSQL usa primero el composite index `(restaurantId, deletedAt)` para acotar al catálogo del restaurante, y luego aplica el `ILIKE` sobre ese set reducido.

### Service — `listProductsWithPagination`

Adds `search?: string` to the signature and passes it through to the repository. No other logic changes.

### Controller

Replaces `PaginationDto` with `ProductQueryDto` in the `@Query()` decorator of `GET /v1/products` and passes `query.search` to the service.

## UI (React)

Only `ProductsIsland.tsx` changes.

### Search input with debounce

```tsx
const [search, setSearch] = useState('');
const debouncedSearch = useDebounce(search, 300);
```

A `useDebounce` hook (~10 lines) is added to `apps/ui/src/hooks/useDebounce.ts`.

### Wiring to TableWithFetch

```tsx
<input
  type="search"
  placeholder="Buscar por nombre o SKU..."
  value={search}
  onChange={e => setSearch(e.target.value)}
  className="..."
/>

<TableWithFetch
  key={debouncedSearch}
  url={PRODUCTS_QUERY_KEY}
  columns={columns}
  params={{ limit: '50', ...(debouncedSearch ? { search: debouncedSearch } : {}) }}
  emptyMessage="No hay productos"
/>
```

Using `key={debouncedSearch}` causes React to remount `TableWithFetch` when the search changes, which resets its internal `page` state to 1. No changes to `TableWithFetch`, `ProductForm`, or any other component.

## Files Changed

| File | Change |
|------|--------|
| `apps/api-core/prisma/schema.prisma` | Replace `@@index([deletedAt])` → `@@index([restaurantId, deletedAt])` |
| `apps/api-core/prisma/schema.postgresql.prisma` | Same composite index change |
| `apps/api-core/prisma/migrations/<new>/migration.sql` | Composite index migration |
| `apps/api-core/src/products/dto/product-query.dto.ts` | New DTO |
| `apps/api-core/src/products/dto/index.ts` | Export new DTO |
| `apps/api-core/src/products/product.repository.ts` | Add `search` param to paginated query |
| `apps/api-core/src/products/products.service.ts` | Pass `search` through to repository |
| `apps/api-core/src/products/products.controller.ts` | Use `ProductQueryDto` |
| `apps/ui/src/hooks/useDebounce.ts` | New hook |
| `apps/ui/src/components/dash/products/ProductsIsland.tsx` | Add search input + debounce wiring |

## Out of Scope

- Filtering by category or active status
- Pagination changes (search resets to page 1 via React key trick)
- Changes to the kiosk or any other module
