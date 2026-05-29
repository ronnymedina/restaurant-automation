import { KitchenTokenService } from './kitchen-token.service';

describe('KitchenTokenService', () => {
  let service: KitchenTokenService;

  beforeEach(() => {
    service = new KitchenTokenService();
  });

  describe('generate', () => {
    it('returns a 43-char URL-safe base64 plainToken', () => {
      const { plainToken } = service.generate();
      expect(plainToken).toHaveLength(43);
      expect(plainToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('returns a 64-char hex tokenHash that matches hash(plainToken)', () => {
      const { plainToken, tokenHash } = service.generate();
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(service.hash(plainToken)).toEqual(tokenHash);
    });

    it('produces distinct tokens on consecutive calls', () => {
      const a = service.generate();
      const b = service.generate();
      expect(a.plainToken).not.toEqual(b.plainToken);
      expect(a.tokenHash).not.toEqual(b.tokenHash);
    });
  });

  describe('hash', () => {
    it('is deterministic', () => {
      expect(service.hash('abc')).toEqual(service.hash('abc'));
    });

    it('produces different hashes for different inputs', () => {
      expect(service.hash('abc')).not.toEqual(service.hash('abd'));
    });
  });

  describe('verifyHash', () => {
    it('returns true for equal hashes', () => {
      const h = service.hash('token');
      expect(service.verifyHash(h, h)).toBe(true);
    });

    it('returns false for different hashes of same length', () => {
      const a = service.hash('tokenA');
      const b = service.hash('tokenB');
      expect(service.verifyHash(a, b)).toBe(false);
    });

    it('returns false (without throwing) for buffers of different lengths', () => {
      expect(service.verifyHash('short', 'a'.repeat(64))).toBe(false);
    });

    it('returns true for two empty strings (edge case, equal length 0)', () => {
      expect(service.verifyHash('', '')).toBe(true);
    });
  });
});
