import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Encapsulates the cryptographic primitives for kitchen-token authentication.
 *
 * The plain token is shown to the admin exactly once at generation time and is
 * never persisted; the database only ever stores the sha256 hash. If the admin
 * loses the plain token, the only recovery is regeneration, which invalidates
 * all currently connected kitchen screens for that restaurant.
 *
 * Token format: 32 random bytes encoded as URL-safe base64 without padding
 * (43 chars from [A-Za-z0-9_-]). URL-safe encoding lets the token travel via
 * header or query string without further escaping.
 */
@Injectable()
export class KitchenTokenService {
  /**
   * Generates a new kitchen token. Returns both the plain string — which the
   * caller must surface to the admin exactly once — and the hex-encoded
   * sha256 hash that should be persisted to RestaurantSettings.kitchenTokenHash.
   */
  generate(): { plainToken: string; tokenHash: string } {
    const plainToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hash(plainToken);
    return { plainToken, tokenHash };
  }

  /**
   * Computes the sha256 hash of a plain token, encoded as lowercase hex.
   *
   * Hex (not base64) is chosen for the stored form because both inputs to
   * `timingSafeEqual` in verifyHash must be byte buffers of equal length;
   * hex strings are always 64 chars for sha256 regardless of input, which
   * makes the length-equality precondition trivially satisfied.
   */
  hash(plainToken: string): string {
    return crypto.createHash('sha256').update(plainToken, 'utf8').digest('hex');
  }

  /**
   * Constant-time comparison of two hex-encoded sha256 hashes. Returns false
   * immediately when buffer lengths differ (defensive; valid hashes are always
   * 64 chars). Otherwise compares all bytes via `crypto.timingSafeEqual` so
   * the response time does not leak which byte mismatched first — closing the
   * iterative byte-guessing oracle that `===` would create.
   */
  verifyHash(storedHash: string, candidateHash: string): boolean {
    if (storedHash.length !== candidateHash.length) return false;
    const stored = Buffer.from(storedHash, 'utf8');
    const candidate = Buffer.from(candidateHash, 'utf8');
    return crypto.timingSafeEqual(stored, candidate);
  }
}
