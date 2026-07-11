# Common Components (Button, Table, TableWithFetch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create reusable React components (`Providers`, `Button`, `Table`, `TableWithFetch`) in `apps/ui/src/components/commons/` and migrate the categories dashboard page from vanilla JS + Astro to a React island.

**Architecture:** Install TanStack Table + Query, export a singleton `QueryClient` from `Providers.tsx` (re-used across islands via import instead of React context), build three composable components, and replace the categories page's `<script>` block + `DataTable.astro` with a single `CategoriesTable` React island.

**Tech Stack:** Astro 5, React 19, `@tanstack/react-table`, `@tanstack/react-query`, Tailwind CSS, Vitest + jsdom + React Testing Library

---

## File Structure

**New files:**
- `apps/ui/src/components/commons/Providers.tsx` — exports singleton `queryClient` + `QueryClientProvider` wrapper
- `apps/ui/src/components/commons/Button.tsx` — variant/size-aware button
- `apps/ui/src/components/commons/Table.tsx` — presentational table with optional pagination
- `apps/ui/src/components/commons/TableWithFetch.tsx` — Table + TanStack Query data fetching
- `apps/ui/src/components/dash/CategoriesTable.tsx` — categories list + form island
- `apps/ui/src/test/setup.ts` — Vitest global setup (jest-dom matchers)
- `apps/ui/vitest.config.ts` — Vitest configuration

**Modified files:**
- `apps/ui/package.json` — add dependencies and test scripts
- `apps/ui/src/layouts/DashboardLayout.astro` — wrap slot with `<Providers client:load>`
- `apps/ui/src/pages/dash/categories.astro` — replace script + DataTable with React island

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/ui/package.json`

- [ ] **Step 1: Install TanStack and testing packages**

Run from `apps/ui/`:
```bash
pnpm add @tanstack/react-table @tanstack/react-query
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Verify installation**

```bash
pnpm list @tanstack/react-table @tanstack/react-query vitest
```
Expected: all three packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/package.json apps/ui/pnpm-lock.yaml
git commit -m "feat(ui): add tanstack-table, react-query and vitest deps"
```

---

### Task 2: Configure Vitest

**Files:**
- Create: `apps/ui/vitest.config.ts`
- Create: `apps/ui/src/test/setup.ts`
- Modify: `apps/ui/package.json`

- [ ] **Step 1: Create `apps/ui/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 2: Create `apps/ui/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Add test scripts to `apps/ui/package.json`**

In the `"scripts"` section add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Full `scripts` section becomes:
```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Verify Vitest runs without error**

Run from `apps/ui/`:
```bash
pnpm test
```
Expected: exits cleanly with "No test files found" or 0 tests — not a config error.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/vitest.config.ts apps/ui/src/test/setup.ts apps/ui/package.json
git commit -m "feat(ui): configure vitest with jsdom and react testing library"
```

---

### Task 3: Create Providers.tsx

**Files:**
- Create: `apps/ui/src/components/commons/Providers.tsx`
- Create: `apps/ui/src/components/commons/Providers.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/ui/src/components/commons/Providers.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import Providers from './Providers';

test('renders children inside QueryClientProvider', () => {
  render(<Providers><div>test-child</div></Providers>);
  expect(screen.getByText('test-child')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run from `apps/ui/`:
```bash
pnpm test src/components/commons/Providers.test.tsx
```
Expected: FAIL — "Cannot find module './Providers'"

- [ ] **Step 3: Create `apps/ui/src/components/commons/Providers.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm test src/components/commons/Providers.test.tsx
```
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/commons/Providers.tsx apps/ui/src/components/commons/Providers.test.tsx
git commit -m "feat(ui): add Providers component with singleton QueryClient"
```

---

### Task 4: Update DashboardLayout.astro

**Files:**
- Modify: `apps/ui/src/layouts/DashboardLayout.astro`

- [ ] **Step 1: Add Providers import in the frontmatter**

In `apps/ui/src/layouts/DashboardLayout.astro`, inside the `---` frontmatter block, add after the existing imports:
```astro
import Providers from '../components/commons/Providers';
```

- [ ] **Step 2: Wrap the slot with Providers**

Find this block (lines 71–73):
```astro
      <main class="flex-1 p-6">
        <slot />
      </main>
```

Replace with:
```astro
      <main class="flex-1 p-6">
        <Providers client:load>
          <slot />
        </Providers>
      </main>
```

- [ ] **Step 3: Verify dashboard still loads**

Run from repo root:
```bash
pnpm dev
```
Open `http://localhost:4321/dash`. Confirm the layout renders without errors or hydration warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/layouts/DashboardLayout.astro
git commit -m "feat(ui): mount Providers in DashboardLayout for QueryClient context"
```

---

### Task 5: Create Button.tsx

**Files:**
- Create: `apps/ui/src/components/commons/Button.tsx`
- Create: `apps/ui/src/components/commons/Button.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/ui/src/components/commons/Button.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

test('renders with default primary+md classes', () => {
  render(<Button>Click me</Button>);
  const btn = screen.getByRole('button', { name: 'Click me' });
  expect(btn).toHaveClass('bg-indigo-600', 'px-4', 'py-2', 'text-sm');
});

test('applies danger variant', () => {
  render(<Button variant="danger">Delete</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-red-600');
});

test('applies secondary variant', () => {
  render(<Button variant="secondary">Cancel</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-slate-100', 'text-slate-700');
});

test('applies warning variant', () => {
  render(<Button variant="warning">Warn</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-amber-500');
});

test('applies sm size', () => {
  render(<Button size="sm">Small</Button>);
  expect(screen.getByRole('button')).toHaveClass('px-3', 'py-1.5', 'text-xs');
});

test('applies lg size', () => {
  render(<Button size="lg">Large</Button>);
  expect(screen.getByRole('button')).toHaveClass('px-5', 'py-2.5', 'text-base');
});

test('appends custom className', () => {
  render(<Button className="mt-4">Extra</Button>);
  expect(screen.getByRole('button')).toHaveClass('mt-4');
});

test('calls onClick when clicked', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click</Button>);
  fireEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledOnce();
});

test('sets type attribute', () => {
  render(<Button type="submit">Submit</Button>);
  expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
});

test('is disabled when disabled prop passed', () => {
  render(<Button disabled>Off</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test src/components/commons/Button.test.tsx
```
Expected: FAIL — "Cannot find module './Button'"

- [ ] **Step 3: Create `apps/ui/src/components/commons/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

const base =
  'font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
pnpm test src/components/commons/Button.test.tsx
```
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/commons/Button.tsx apps/ui/src/components/commons/Button.test.tsx
git commit -m "feat(ui): add Button component with variant and size support"
```

---

### Task 6: Create Table.tsx

**Files:**
- Create: `apps/ui/src/components/commons/Table.tsx`
- Create: `apps/ui/src/components/commons/Table.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/ui/src/components/commons/Table.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import Table from './Table';

interface Row { id: number; name: string }

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Nombre' },
];

const data: Row[] = [
  { id: 1, name: 'Bebidas' },
  { id: 2, name: 'Postres' },
];

test('renders column headers', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.getByText('ID')).toBeInTheDocument();
  expect(screen.getByText('Nombre')).toBeInTheDocument();
});

test('renders data rows', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.getByText('Bebidas')).toBeInTheDocument();
  expect(screen.getByText('Postres')).toBeInTheDocument();
});

test('shows custom empty message when data is empty', () => {
  render(<Table columns={columns} data={[]} emptyMessage="Sin categorías" />);
  expect(screen.getByText('Sin categorías')).toBeInTheDocument();
});

test('shows default empty message', () => {
  render(<Table columns={columns} data={[]} />);
  expect(screen.getByText('No hay registros')).toBeInTheDocument();
});

test('shows loading text when isLoading is true', () => {
  render(<Table columns={columns} data={[]} isLoading />);
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('calls onPageChange when a page button is clicked', () => {
  const onPageChange = vi.fn();
  render(
    <Table
      columns={columns}
      data={data}
      pagination={{ page: 1, totalPages: 3, onPageChange }}
    />,
  );
  fireEvent.click(screen.getByText('2'));
  expect(onPageChange).toHaveBeenCalledWith(2);
});

test('renders all page buttons', () => {
  render(
    <Table
      columns={columns}
      data={data}
      pagination={{ page: 1, totalPages: 3, onPageChange: vi.fn() }}
    />,
  );
  expect(screen.getByText('1')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
});

test('renders no pagination when pagination prop is absent', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test src/components/commons/Table.test.tsx
```
Expected: FAIL — "Cannot find module './Table'"

- [ ] **Step 3: Create `apps/ui/src/components/commons/Table.tsx`**

```tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

interface TableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  pagination?: PaginationProps;
}

export default function Table<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No hay registros',
  pagination,
}: TableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-4 text-center text-sm text-gray-500"
              >
                Cargando...
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-4 text-center text-sm text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm text-gray-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {pagination && (
        <div className="flex gap-1 mt-4 justify-end">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => pagination.onPageChange(p)}
              className={`px-3 py-1 text-sm rounded ${
                p === pagination.page
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
pnpm test src/components/commons/Table.test.tsx
```
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/commons/Table.tsx apps/ui/src/components/commons/Table.test.tsx
git commit -m "feat(ui): add Table component with TanStack Table and optional pagination"
```

---

### Task 7: Create TableWithFetch.tsx

**Files:**
- Create: `apps/ui/src/components/commons/TableWithFetch.tsx`
- Create: `apps/ui/src/components/commons/TableWithFetch.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/ui/src/components/commons/TableWithFetch.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import TableWithFetch from './TableWithFetch';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../lib/api';
const mockApiFetch = vi.mocked(apiFetch);

interface Category { id: number; name: string }
const columns: ColumnDef<Category>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Nombre' },
];

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

test('shows loading state initially', () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 20 } }),
  } as Response);

  render(<TableWithFetch url="/v1/categories" columns={columns} />, { wrapper: makeWrapper() });
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('renders fetched data', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [{ id: 1, name: 'Bebidas' }],
      meta: { page: 1, totalPages: 1, total: 1, limit: 20 },
    }),
  } as Response);

  render(<TableWithFetch url="/v1/categories" columns={columns} />, { wrapper: makeWrapper() });
  await waitFor(() => expect(screen.getByText('Bebidas')).toBeInTheDocument());
});

test('shows error row on non-ok response', async () => {
  mockApiFetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
  } as Response);

  render(<TableWithFetch url="/v1/categories" columns={columns} />, { wrapper: makeWrapper() });
  await waitFor(() =>
    expect(screen.getByText('Error al cargar los datos')).toBeInTheDocument(),
  );
});

test('shows error row on network failure', async () => {
  mockApiFetch.mockRejectedValue(new Error('Network error'));

  render(<TableWithFetch url="/v1/categories" columns={columns} />, { wrapper: makeWrapper() });
  await waitFor(() =>
    expect(screen.getByText('Error al cargar los datos')).toBeInTheDocument(),
  );
});

test('passes emptyMessage to Table', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 20 } }),
  } as Response);

  render(
    <TableWithFetch url="/v1/categories" columns={columns} emptyMessage="Sin categorías" />,
    { wrapper: makeWrapper() },
  );
  await waitFor(() => expect(screen.getByText('Sin categorías')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test src/components/commons/TableWithFetch.test.tsx
```
Expected: FAIL — "Cannot find module './TableWithFetch'"

- [ ] **Step 3: Create `apps/ui/src/components/commons/TableWithFetch.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Table from './Table';
import { apiFetch } from '../../lib/api';

interface Meta {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

interface ApiResponse<T> {
  data: T[];
  meta: Meta;
}

interface TableWithFetchProps<T> {
  url: string;
  columns: ColumnDef<T>[];
  params?: Record<string, string>;
  emptyMessage?: string;
}

export default function TableWithFetch<T>({
  url,
  columns,
  params = {},
  emptyMessage,
}: TableWithFetchProps<T>) {
  const [page, setPage] = useState(1);

  const queryString = new URLSearchParams({ ...params, page: String(page) }).toString();

  const { data, isLoading, isError } = useQuery<ApiResponse<T>>({
    queryKey: [url, params, page],
    queryFn: async () => {
      const res = await apiFetch(`${url}?${queryString}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ApiResponse<T>>;
    },
  });

  if (isError) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <tbody>
            <tr>
              <td className="px-4 py-4 text-center text-sm text-red-600">
                Error al cargar los datos
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Table
      columns={columns}
      data={data?.data ?? []}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      pagination={
        data?.meta && data.meta.totalPages > 1
          ? { page, totalPages: data.meta.totalPages, onPageChange: setPage }
          : undefined
      }
    />
  );
}
```

- [ ] **Step 4: Run all tests to verify**

```bash
pnpm test
```
Expected: PASS — Providers (1) + Button (10) + Table (8) + TableWithFetch (5) = 24 tests

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/commons/TableWithFetch.tsx apps/ui/src/components/commons/TableWithFetch.test.tsx
git commit -m "feat(ui): add TableWithFetch component with TanStack Query data fetching"
```

---

### Task 8: Create CategoriesTable.tsx

**Files:**
- Create: `apps/ui/src/components/dash/CategoriesTable.tsx`

- [ ] **Step 1: Create `apps/ui/src/components/dash/CategoriesTable.tsx`**

```tsx
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../commons/Providers';
import TableWithFetch from '../commons/TableWithFetch';
import Button from '../commons/Button';
import { apiFetch } from '../../lib/api';

interface Category {
  id: number;
  name: string;
  createdAt: string | null | undefined;
}

const formatDate = (val: string | null | undefined) =>
  val ? new Date(val).toLocaleDateString('es-MX') : '—';

export default function CategoriesTable() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setError('');
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setFormName(category.name);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    try {
      const res = await apiFetch(`/v1/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['/v1/categories'] });
    } catch {
      alert('Error al eliminar la categoría');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('El nombre es requerido');
      return;
    }
    try {
      const res = editingId
        ? await apiFetch(`/v1/categories/${editingId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: formName }),
          })
        : await apiFetch('/v1/categories', {
            method: 'POST',
            body: JSON.stringify({ name: formName }),
          });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['/v1/categories'] });
      resetForm();
    } catch {
      setError('Error al guardar la categoría');
    }
  };

  const columns: ColumnDef<Category>[] = [
    { accessorKey: 'name', header: 'Nombre' },
    {
      id: 'createdAt',
      header: 'Fecha de creación',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(row.original)}>
            Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(row.original.id)}>
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">Categorías</h2>
          <Button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? 'Cancelar' : 'Nueva categoría'}
          </Button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              {editingId ? 'Editar categoría' : 'Nueva categoría'}
            </h3>
            <form onSubmit={handleSubmit} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nombre de la categoría"
                />
              </div>
              <Button type="submit">Guardar</Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancelar
              </Button>
            </form>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        )}

        <TableWithFetch<Category>
          url="/v1/categories"
          columns={columns}
          params={{ limit: '20' }}
          emptyMessage="No hay categorías"
        />
      </div>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/CategoriesTable.tsx
git commit -m "feat(ui): add CategoriesTable React island with TableWithFetch and form"
```

---

### Task 9: Migrate categories.astro

**Files:**
- Modify: `apps/ui/src/pages/dash/categories.astro`

- [ ] **Step 1: Replace categories.astro content**

Replace the entire content of `apps/ui/src/pages/dash/categories.astro` with:

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import CategoriesTable from '../../components/dash/CategoriesTable';
---

<DashboardLayout>
  <CategoriesTable client:load />
</DashboardLayout>
```

- [ ] **Step 2: Verify the page renders and functions correctly**

Run from repo root:
```bash
pnpm dev
```

Open `http://localhost:4321/dash/categories`. Verify:
- [ ] Categories list loads and shows table rows
- [ ] "Nueva categoría" button reveals the create form
- [ ] Submitting the form creates a category that appears in the table (no page reload)
- [ ] Clicking "Editar" pre-fills the form with the category name
- [ ] Saving the edit updates the row immediately
- [ ] Clicking "Eliminar" shows a confirm dialog and removes the row on confirm
- [ ] Dates display as `dd/mm/yyyy` (es-MX locale) or `—` if null
- [ ] Empty state shows "No hay categorías" when there are no rows
- [ ] Other dashboard pages (products, users, etc.) are unaffected

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/pages/dash/categories.astro
git commit -m "feat(ui): migrate categories page to React island (Button+Table+TableWithFetch)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Add `@tanstack/react-table` and `@tanstack/react-query` | Task 1 |
| `Providers.tsx` — singleton QueryClient with `staleTime: 30_000, retry: 1` | Task 3 |
| `DashboardLayout.astro` wraps `<slot />` inside `<Providers client:load>` | Task 4 |
| `Button` — variant, size, className, type, ...rest props | Task 5 |
| `Button` — primary/secondary/danger/warning styles | Task 5 |
| `Button` — sm/md/lg sizes | Task 5 |
| `Button` — base classes including disabled styles | Task 5 |
| `Table` — columns, data, isLoading, emptyMessage, pagination props | Task 6 |
| `Table` — custom cell renderers via columns array | Task 6 |
| `Table` — pagination with indigo active / slate default buttons | Task 6 |
| `TableWithFetch` — url, columns, params, emptyMessage props | Task 7 |
| `TableWithFetch` — `useQuery` with `queryKey: [url, params, page]` | Task 7 |
| `TableWithFetch` — `apiFetch` integration | Task 7 |
| `TableWithFetch` — internal `page` state with `useState` | Task 7 |
| `TableWithFetch` — error row on failure | Task 7 |
| `TableWithFetch` — pagination wired from `meta.totalPages` | Task 7 |
| categories.astro — remove entire `<script>` block | Task 9 |
| categories.astro — remove `DataTable.astro` import | Task 9 |
| categories.astro — mount React island | Tasks 8 + 9 |
| Bug fix: `formatDate` for null/undefined `createdAt` | Task 8 |

All spec requirements are covered.

### Placeholder scan

No TBD, TODO, "implement later", or "similar to Task N" patterns present. All code blocks are complete.

### Type consistency

- `ColumnDef<T>` from `@tanstack/react-table` used consistently across `Table`, `TableWithFetch`, `CategoriesTable`
- `PaginationProps` defined inside `Table.tsx` and consumed only there
- `ApiResponse<T>` defined in `TableWithFetch.tsx` and used only there
- `queryClient` exported from `Providers.tsx`, imported in `CategoriesTable.tsx`
- `apiFetch` imported from `../../lib/api` in both `TableWithFetch.tsx` and `CategoriesTable.tsx`
- `formatDate` signature `(val: string | null | undefined) => string` consistent with `Category.createdAt` type
