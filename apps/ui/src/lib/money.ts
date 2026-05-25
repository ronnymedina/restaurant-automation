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
}

export const DEFAULT_MONEY_DISPLAY_SETTINGS: MoneyDisplaySettings = {
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

export function formatMoney(
  amount: number,
  settings: MoneyDisplaySettings = DEFAULT_MONEY_DISPLAY_SETTINGS,
): string {
  // Guard non-finite inputs (NaN, Infinity) — surface as $0,00 rather than "$NaN"
  // which would make a UI bug look like a backend bug to the cashier.
  if (!Number.isFinite(amount)) {
    return `$0${settings.decimalSeparator}00`;
  }

  const sign = amount < 0 ? '-' : '';
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousandsSeparator);

  return `${sign}$${withThousands}${settings.decimalSeparator}${decPart}`;
}
