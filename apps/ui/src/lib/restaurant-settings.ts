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

// placeholderData (not initialData) lets the query fetch on first mount while
// still rendering synchronously with sensible defaults. initialData with
// staleTime:Infinity would mark the placeholder as permanently fresh and
// prevent fetchRestaurantSettings from ever being called.
export function useRestaurantSettings() {
  const result = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: fetchRestaurantSettings,
    staleTime: Infinity,
    placeholderData: DEFAULT_RESTAURANT_SETTINGS,
  });
  return { ...result, data: result.data ?? DEFAULT_RESTAURANT_SETTINGS };
}
