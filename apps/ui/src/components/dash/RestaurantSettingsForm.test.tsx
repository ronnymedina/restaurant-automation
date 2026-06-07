// src/components/dash/RestaurantSettingsForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RestaurantSettingsForm from './RestaurantSettingsForm';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

vi.mock('../../lib/restaurant-settings', () => ({
  useRestaurantSettings: vi.fn(),
  DEFAULT_RESTAURANT_SETTINGS: {
    name: '',
    slug: '',
    timezone: 'UTC',
    country: 'CL',
    currency: 'CLP',
    decimalSeparator: ',',
    thousandsSeparator: '.',
  },
}));

import { apiFetch } from '../../lib/api';
import { useRestaurantSettings } from '../../lib/restaurant-settings';
const mockApiFetch = vi.mocked(apiFetch);
const mockUseSettings = vi.mocked(useRestaurantSettings);

const SETTINGS = {
  name: 'Mi Restaurante',
  slug: 'mi-restaurante',
  timezone: 'America/Santiago',
  country: 'CL',
  currency: 'CLP',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSettings.mockReturnValue({ data: SETTINGS } as any);
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => SETTINGS,
  } as Response);
});

describe('RestaurantSettingsForm', () => {
  it('renders editable fields after settings load', async () => {
    render(<RestaurantSettingsForm />);
    expect(await screen.findByDisplayValue('Mi Restaurante')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /zona horaria/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /punto/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /coma/i })).toBeInTheDocument();
  });

  it('renders read-only info section with slug, country, currency', async () => {
    render(<RestaurantSettingsForm />);
    await screen.findByDisplayValue('Mi Restaurante');
    expect(screen.getByText('mi-restaurante')).toBeInTheDocument();
    expect(screen.getByText('CL')).toBeInTheDocument();
    expect(screen.getByText('CLP')).toBeInTheDocument();
  });

  it('PATCH contains only changed fields — not currency, slug, or country', async () => {
    render(<RestaurantSettingsForm />);
    const nameInput = await screen.findByDisplayValue('Mi Restaurante');
    fireEvent.change(nameInput, { target: { value: 'Nuevo Nombre' } });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...SETTINGS, name: 'Nuevo Nombre' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body).toEqual({ name: 'Nuevo Nombre' });
      expect(body).not.toHaveProperty('currency');
      expect(body).not.toHaveProperty('slug');
      expect(body).not.toHaveProperty('country');
    });
  });

  it('shows success message after successful save', async () => {
    render(<RestaurantSettingsForm />);
    const nameInput = await screen.findByDisplayValue('Mi Restaurante');
    fireEvent.change(nameInput, { target: { value: 'Nuevo Nombre' } });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...SETTINGS, name: 'Nuevo Nombre' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/configuración guardada/i)).toBeInTheDocument();
  });

  it('shows error message when API returns error', async () => {
    render(<RestaurantSettingsForm />);
    const nameInput = await screen.findByDisplayValue('Mi Restaurante');
    fireEvent.change(nameInput, { target: { value: 'Otro Nombre' } });

    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Error del servidor' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText('Error del servidor')).toBeInTheDocument();
  });

  it('timezone select contains options from the country', async () => {
    render(<RestaurantSettingsForm />);
    await screen.findByDisplayValue('Mi Restaurante');
    expect(screen.getByRole('option', { name: 'America/Santiago' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'America/Punta_Arenas' })).toBeInTheDocument();
  });
});
