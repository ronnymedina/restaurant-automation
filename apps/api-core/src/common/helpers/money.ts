/**
 * Money helpers — BigInt cent strategy
 *
 * All monetary values are stored in the database as BigInt (centavos).
 * These helpers handle the conversion between the DB representation and
 * the human-readable decimal value used in DTOs and API responses.
 *
 * Rule of gold: NEVER use floating-point arithmetic for money calculations.
 * Always operate with BigInt centavos inside the domain layer.
 */

/**
 * Converts an integer centavos value to BigInt for database storage.
 * The DTO/API layer communicates prices already in centavos (integers).
 *
 * Convention: price:number in DTOs is always centavos (e.g. 1250 = $12.50).
 * This function wraps the value in BigInt for Prisma compatibility.
 *
 * @example toCents(1250) === 1250n  ($12.50)
 * @example toCents(0)    === 0n
 */
export function toCents(amount: number): bigint {
  return BigInt(amount);
}

/**
 * Converts a BigInt centavos value back to a human-readable decimal number.
 * This is ONLY used in the serialization layer (API responses) — never for arithmetic.
 *
 * Accepts both `bigint` and `number` because the better-sqlite3 driver adapter
 * may return INTEGER columns as JavaScript `number` instead of `bigint`.
 *
 * @example fromCents(1250n) === 12.5
 * @example fromCents(1250)  === 12.5
 * @example fromCents(0n)    === 0
 */
export function fromCents(cents: bigint | number): number {
  return Number(cents) / 100;
}
