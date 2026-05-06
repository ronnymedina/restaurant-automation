import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import ProductsIsland from './ProductsIsland';

vi.mock('../../../lib/products-api', () => ({
  fetchCategories: vi.fn().mockResolvedValue([
    { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Bebidas' },
  ]),
  deleteProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadImage: vi.fn(),
  PRODUCTS_QUERY_KEY: '/v1/products',
  CATEGORIES_QUERY_KEY: '/v1/categories',
}));

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

import { apiFetch } from '../../../lib/api';
import { deleteProduct } from '../../../lib/products-api';
const mockApiFetch = vi.mocked(apiFetch);
const mockDelete = vi.mocked(deleteProduct);

const emptyResponse = {
  ok: true,
  json: async () => ({ data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 50 } }),
} as Response;

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(emptyResponse);
});

test('renders "Productos" heading and "Nuevo producto" button', () => {
  render(<ProductsIsland />);
  expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeInTheDocument();
});

test('shows ProductForm when "Nuevo producto" is clicked', async () => {
  render(<ProductsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
  expect(screen.getByRole('heading', { name: 'Nuevo producto', level: 3 })).toBeInTheDocument();
});

test('hides ProductForm when cancel is clicked', async () => {
  render(<ProductsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('heading', { name: 'Nuevo producto', level: 3 })).not.toBeInTheDocument();
});

test('shows empty table message when API returns no products', async () => {
  render(<ProductsIsland />);
  await waitFor(() => expect(screen.getByText('No hay productos')).toBeInTheDocument());
});

test('renders product rows from API response', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [
        {
          id: 'p1',
          name: 'Agua',
          price: 5,
          stock: null,
          active: true,
          sku: null,
          imageUrl: null,
          description: null,
          restaurantId: 'r1',
          categoryId: '550e8400-e29b-41d4-a716-446655440001',
          createdAt: '2026-01-01T00:00:00Z',
          category: { name: 'Bebidas' },
        },
      ],
      meta: { page: 1, totalPages: 1, total: 1, limit: 50 },
    }),
  } as Response);

  render(<ProductsIsland />);
  await waitFor(() => expect(screen.getByText('Agua')).toBeInTheDocument());
  expect(screen.getByText('Bebidas')).toBeInTheDocument();
  expect(screen.getByText('$5.00')).toBeInTheDocument();
});

test('renders a search input', () => {
  render(<ProductsIsland />);
  expect(screen.getByPlaceholderText('Buscar por nombre o SKU...')).toBeInTheDocument();
});

test('calls API with limit=5 and search param when user types', async () => {
  render(<ProductsIsland />);

  const input = screen.getByPlaceholderText('Buscar por nombre o SKU...');
  fireEvent.change(input, { target: { value: 'burger' } });

  // Wait for debounce (300ms) — advance fake timers or use waitFor with real timers
  await waitFor(() => {
    const calls = mockApiFetch.mock.calls;
    const searchCall = calls.find(([url]: [string]) =>
      typeof url === 'string' && url.includes('search=burger'),
    );
    expect(searchCall).toBeDefined();
    expect(searchCall![0]).toContain('limit=5');
  }, { timeout: 1000 });
});

test('uses limit=50 when search is empty', async () => {
  render(<ProductsIsland />);

  await waitFor(() => {
    const calls = mockApiFetch.mock.calls;
    const firstCall = calls[0]?.[0];
    expect(firstCall).toContain('limit=50');
  });
});
