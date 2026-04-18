import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import MenuDetailIsland from './MenuDetailIsland';

vi.mock('../../../lib/menus-api', () => ({
  fetchMenuById: vi.fn(),
  bulkCreateMenuItems: vi.fn(),
  updateMenuItem: vi.fn(),
  deleteMenuItem: vi.fn(),
  MENUS_QUERY_KEY: '/v1/menus',
}));

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  };
});

// jsdom does not set window.location.search — set it before import
Object.defineProperty(window, 'location', {
  value: { search: '?id=menu-abc', href: '' },
  writable: true,
});

import { fetchMenuById } from '../../../lib/menus-api';
import { queryClient } from '../../commons/Providers';
const mockFetchMenu = vi.mocked(fetchMenuById);

const mockMenu = {
  id: 'menu-abc',
  name: 'Almuerzo',
  active: true,
  startTime: '12:00',
  endTime: '15:00',
  daysOfWeek: 'MON,FRI',
  itemsCount: 2,
  items: [
    {
      id: 'item-1',
      productId: 'prod-1',
      sectionName: 'Carnes',
      order: 1,
      product: { name: 'Lomo', price: 50, category: { name: 'Platos' } },
    },
    {
      id: 'item-2',
      productId: 'prod-2',
      sectionName: 'Carnes',
      order: 2,
      product: { name: 'Pollo', price: 35, category: { name: 'Platos' } },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

test('renders menu name from API', async () => {
  mockFetchMenu.mockResolvedValue(mockMenu);
  render(<MenuDetailIsland />);
  await waitFor(() => expect(screen.getByText('Almuerzo')).toBeInTheDocument());
});

test('renders section header', async () => {
  mockFetchMenu.mockResolvedValue(mockMenu);
  render(<MenuDetailIsland />);
  await waitFor(() => expect(screen.getByText('Carnes')).toBeInTheDocument());
});

test('renders product names in section', async () => {
  mockFetchMenu.mockResolvedValue(mockMenu);
  render(<MenuDetailIsland />);
  await waitFor(() => {
    expect(screen.getByText('Lomo')).toBeInTheDocument();
    expect(screen.getByText('Pollo')).toBeInTheDocument();
  });
});

test('shows loading state initially', () => {
  mockFetchMenu.mockReturnValue(new Promise(() => {}));
  render(<MenuDetailIsland />);
  expect(screen.getByText(/Cargando/i)).toBeInTheDocument();
});

test('shows error when menu not found', async () => {
  mockFetchMenu.mockRejectedValue(new Error('HTTP 404'));
  render(<MenuDetailIsland />);
  await waitFor(() =>
    expect(screen.getByText(/Error al cargar el menú/i)).toBeInTheDocument(),
  );
});
