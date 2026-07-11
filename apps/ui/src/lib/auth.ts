import { config } from '../config';
import type { MoneyDisplaySettings } from './money';
import { DEFAULT_MONEY_DISPLAY_SETTINGS } from './money';

const TIMEZONE_KEY = 'restaurantTimezone';
const DECIMAL_SEP_KEY = 'restaurantDecimalSeparator';
const THOUSANDS_SEP_KEY = 'restaurantThousandsSeparator';

export function getRestaurantTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) ?? 'UTC';
}

export function setRestaurantTimezone(timezone: string): void {
  localStorage.setItem(TIMEZONE_KEY, timezone);
}

export function setMoneyDisplaySettings(decimalSeparator: string, thousandsSeparator: string): void {
  localStorage.setItem(DECIMAL_SEP_KEY, decimalSeparator);
  localStorage.setItem(THOUSANDS_SEP_KEY, thousandsSeparator);
}

export function getMoneyDisplaySettings(): MoneyDisplaySettings {
  return {
    decimalSeparator: localStorage.getItem(DECIMAL_SEP_KEY) ?? DEFAULT_MONEY_DISPLAY_SETTINGS.decimalSeparator,
    thousandsSeparator: localStorage.getItem(THOUSANDS_SEP_KEY) ?? DEFAULT_MONEY_DISPLAY_SETTINGS.thousandsSeparator,
  };
}

export function clearLocalAuthState(): void {
  localStorage.removeItem(TIMEZONE_KEY);
  localStorage.removeItem(DECIMAL_SEP_KEY);
  localStorage.removeItem(THOUSANDS_SEP_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const res = await fetch(`${config.apiUrl}/v1/auth/me`, { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}
