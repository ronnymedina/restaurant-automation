# Common Components — apps/ui

Reusable React components located in `src/components/commons/`.

## Status

| Component | Status | Notes |
|---|---|---|
| `Button` | planned | Variants: primary, secondary, danger, warning. Sizes: sm, md, lg |
| `Table` | planned | Headless via TanStack Table. Purely presentational |
| `TableWithFetch` | planned | Wraps Table with TanStack Query for data fetching |
| `Providers` | planned | QueryClientProvider wrapper for React islands |

## Planned (future iterations)

| Component | Notes |
|---|---|
| `Modal` | Dialog/overlay for confirmations and forms |
| `Badge` | Status indicators (e.g. order state, active/inactive) |
| `Input` | Form input with label, error message, and validation state |
| `Select` | Dropdown select with consistent styling |
| `Pagination` | Standalone pagination bar (extracted from Table) |
| `Alert` | Inline feedback messages (success, error, warning, info) |
| `Spinner` | Loading indicator for buttons and sections |
| `ConfirmDialog` | Reusable confirmation modal (replaces native `confirm()`) |
| `EmptyState` | Empty table/list placeholder with icon and message |
| `Avatar` | User avatar with fallback initials |
