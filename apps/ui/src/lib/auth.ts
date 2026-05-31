import { config } from '../config';

const TIMEZONE_KEY = 'restaurantTimezone';

export function getRestaurantTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) ?? 'UTC';
}

export function setRestaurantTimezone(timezone: string): void {
  localStorage.setItem(TIMEZONE_KEY, timezone);
}

export function clearLocalAuthState(): void {
  localStorage.removeItem(TIMEZONE_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const res = await fetch(`${config.apiUrl}/v1/auth/me`, { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}
