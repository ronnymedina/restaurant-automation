import { describe, it, expect } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  const cl = { decimalSeparator: ',', thousandsSeparator: '.' };
  const mx = { decimalSeparator: '.', thousandsSeparator: ',' };

  it('formats integers with Chilean separators', () => {
    expect(formatMoney(25000, cl)).toBe('$25.000,00');
  });

  it('formats integers with Mexican separators', () => {
    expect(formatMoney(25000, mx)).toBe('$25,000.00');
  });

  it('formats small numbers (no thousands separator needed)', () => {
    expect(formatMoney(25, cl)).toBe('$25,00');
    expect(formatMoney(0, cl)).toBe('$0,00');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatMoney(25.5, cl)).toBe('$25,50');
    expect(formatMoney(25.999, cl)).toBe('$26,00');
  });

  it('handles negative amounts with sign before $', () => {
    expect(formatMoney(-25000, cl)).toBe('-$25.000,00');
  });

  it('handles millions', () => {
    expect(formatMoney(1234567.89, cl)).toBe('$1.234.567,89');
  });

  it('falls back to default separators when none provided', () => {
    expect(formatMoney(1000)).toBe('$1.000,00');
  });

  it('returns $0,00 for NaN / Infinity instead of "$NaN"', () => {
    expect(formatMoney(NaN, cl)).toBe('$0,00');
    expect(formatMoney(Infinity, cl)).toBe('$0,00');
    expect(formatMoney(NaN, mx)).toBe('$0.00');
  });

  it('uses the currency symbol when a currency code is provided', () => {
    expect(formatMoney(25000, { ...cl, currency: 'EUR' })).toBe('€25.000,00');
    expect(formatMoney(25000, { ...mx, currency: 'USD' })).toBe('$25,000.00');
    expect(formatMoney(1000, { ...cl, currency: 'BRL' })).toBe('R$1.000,00');
  });

  it('falls back to $ for unknown or missing currency codes', () => {
    expect(formatMoney(1000, { ...cl, currency: 'ZZZ' })).toBe('$1.000,00');
    expect(formatMoney(1000, cl)).toBe('$1.000,00');
  });
});
