import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import MenusIsland from './MenusIsland';

vi.mock('../../../lib/menus-api', () => ({
  deleteMenu: vi.fn(),
  MENUS_QUERY_KEY: '/v1/menus',
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
import { deleteMenu } from '../../../lib/menus-api';

const mockApiFetch = vi.mocked(apiFetch);
const mockDelete = vi.mocked(deleteMenu);

const emptyResponse = {
  ok: true,
  json: async () => ({ data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 50 } }),
} as Response;

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(emptyResponse);
});

test('renders "Menús" heading and "Nuevo menú" button', () => {
  render(<MenusIsland />);
  expect(screen.getByRole('heading', { name: 'Menús' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nuevo menú' })).toBeInTheDocument();
});

test('shows MenuForm when "Nuevo menú" is clicked', () => {
  render(<MenusIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo menú' }));
  expect(screen.getByRole('heading', { name: 'Nuevo menú', level: 3 })).toBeInTheDocument();
});

test('hides MenuForm when cancel is clicked', () => {
  render(<MenusIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo menú' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('heading', { name: 'Nuevo menú', level: 3 })).not.toBeInTheDocument();
});

test('shows empty table message when API returns no menus', async () => {
  render(<MenusIsland />);
  await waitFor(() => expect(screen.getByText('No hay menús')).toBeInTheDocument());
});

test('renders menu rows from API response', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [
        {
          id: 'm1',
          name: 'Almuerzo',
          active: true,
          startTime: '12:00',
          endTime: '15:00',
          daysOfWeek: 'MON,TUE',
          itemsCount: 3,
        },
      ],
      meta: { page: 1, totalPages: 1, total: 1, limit: 50 },
    }),
  } as Response);

  render(<MenusIsland />);
  await waitFor(() => expect(screen.getByText('Almuerzo')).toBeInTheDocument());
  expect(screen.getByText('12:00 - 15:00')).toBeInTheDocument();
});
