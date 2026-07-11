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
