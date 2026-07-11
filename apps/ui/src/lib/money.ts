// apps/ui/src/lib/money.ts
//
// Money formatting for the dashboard UI.
//
// The backend exposes monetary values in pesos (already converted from BigInt
// centavos via fromCents in serializers). This module only handles display —
// the wire format never carries separators or symbols, just plain numbers.
//
// All currencies render with 2 decimal places; the decimal and thousands
// separators come from RestaurantSettings so each restaurant can match its
// country's convention without us special-casing currencies in code.

export interface MoneyDisplaySettings {
  decimalSeparator: string;
  thousandsSeparator: string;
  // ISO 4217 code — only picks the display symbol; the domain stays
  // currency-agnostic (always 2 decimals). Optional so callers that only
  // know the separators (e.g. the kiosk status payload) keep working.
  currency?: string;
}

export const DEFAULT_MONEY_DISPLAY_SETTINGS: MoneyDisplaySettings = {
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

// Currency code → display symbol. Codes not listed fall back to '$' (most
// LatAm currencies use it), preserving the previous hardcoded behaviour.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', CLP: '$', MXN: '$', ARS: '$', COP: '$', CAD: '$', UYU: '$',
  EUR: '€', GBP: '£', BRL: 'R$', PEN: 'S/', BOB: 'Bs', PYG: '₲',
};

function currencySymbol(code?: string): string {
  if (!code) return '$';
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? '$';
}

export function formatMoney(
  amount: number,
  settings: MoneyDisplaySettings = DEFAULT_MONEY_DISPLAY_SETTINGS,
): string {
  const symbol = currencySymbol(settings.currency);

  // Guard non-finite inputs (NaN, Infinity) — surface as $0,00 rather than "$NaN"
  // which would make a UI bug look like a backend bug to the cashier.
  if (!Number.isFinite(amount)) {
    return `${symbol}0${settings.decimalSeparator}00`;
  }

  const sign = amount < 0 ? '-' : '';
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousandsSeparator);

  return `${sign}${symbol}${withThousands}${settings.decimalSeparator}${decPart}`;
}
