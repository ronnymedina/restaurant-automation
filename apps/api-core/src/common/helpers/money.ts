/**
 * Money helpers — BigInt cent strategy
 *
 * All monetary values are stored in the database as BigInt (centavos).
 * These helpers handle the conversion between the DB representation and
 * the human-readable decimal value used in DTOs and API responses.
 *
 * Rule of gold: NEVER use floating-point arithmetic for money calculations.
 * Always operate with BigInt centavos inside the domain layer.
 *
 * Convention:
 *   - API requests:  price in pesos (decimal) — e.g. 300 or 12.5
 *   - DB / domain:   price in centavos (BigInt) — e.g. 30000n or 1250n
 *   - API responses: price in pesos (decimal) — e.g. 300 or 12.5
 */

/**
 * Converts a peso decimal value to BigInt centavos for database storage.
 * Used in DTO @Transform decorators to convert incoming API request prices.
 *
 * @example toCents(300)  === 30000n  ($300 pesos)
 * @example toCents(12.5) === 1250n   ($12.50 pesos)
 * @example toCents(0)    === 0n
 */
export function toCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

/**
 * Converts a BigInt centavos value back to a human-readable decimal peso number.
 * Used ONLY in the serialization layer (API responses) — never for arithmetic.
 *
 * Accepts both `bigint` and `number` because the better-sqlite3 driver adapter
 * may return INTEGER columns as JavaScript `number` instead of `bigint`.
 *
 * @example fromCents(30000n) === 300
 * @example fromCents(1250n)  === 12.5
 * @example fromCents(1250)   === 12.5   (sqlite compat)
 * @example fromCents(0n)     === 0
 */
export function fromCents(cents: bigint | number): number {
  return Number(cents) / 100;
}
