// apps/ui/src/lib/restaurant-settings.ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface RestaurantSettings {
  name: string;
  slug: string;
  timezone: string;
  country: string;
  currency: string;
  decimalSeparator: string;
  thousandsSeparator: string;
}

export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettings = {
  name: '',
  slug: '',
  timezone: 'UTC',
  country: 'CL',
  currency: 'CLP',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

export async function fetchRestaurantSettings(): Promise<RestaurantSettings> {
  const res = await apiFetch('/v1/restaurants/settings');
  if (!res.ok) return DEFAULT_RESTAURANT_SETTINGS;
  const data = (await res.json()) as Partial<RestaurantSettings>;
  return { ...DEFAULT_RESTAURANT_SETTINGS, ...data };
}

// Per-session cache: settings barely change and the dashboard already
// re-mounts on hard navigation, so `staleTime: Infinity` is enough.
// `initialData` keeps the first render synchronous with sensible defaults.
export function useRestaurantSettings() {
  return useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: fetchRestaurantSettings,
    staleTime: Infinity,
    initialData: DEFAULT_RESTAURANT_SETTINGS,
  });
}
