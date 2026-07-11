import { toCents, fromCents } from './money';

describe('money helpers', () => {
  describe('toCents', () => {
    it('converts integer pesos to centavos BigInt', () => {
      expect(toCents(300)).toBe(30000n);
    });

    it('converts decimal pesos to centavos BigInt', () => {
      expect(toCents(12.5)).toBe(1250n);
    });

    it('converts zero to 0n', () => {
      expect(toCents(0)).toBe(0n);
    });

    it('rounds correctly to avoid float precision issues', () => {
      expect(toCents(0.1 + 0.2)).toBe(30n); // 0.1 + 0.2 = 0.30000...04
    });
  });

  describe('fromCents', () => {
    it('converts BigInt centavos to decimal pesos', () => {
      expect(fromCents(30000n)).toBe(300);
    });

    it('converts BigInt centavos with decimals', () => {
      expect(fromCents(1250n)).toBe(12.5);
    });

    it('converts number centavos (sqlite driver compat)', () => {
      expect(fromCents(1250)).toBe(12.5);
    });

    it('converts 0n to 0', () => {
      expect(fromCents(0n)).toBe(0);
    });
  });

  describe('round-trip', () => {
    it('toCents(fromCents(x)) is identity for valid centavo values', () => {
      expect(toCents(fromCents(30000n))).toBe(30000n);
    });

    it('fromCents(toCents(x)) is identity for valid peso values', () => {
      expect(fromCents(toCents(300))).toBe(300);
      expect(fromCents(toCents(12.5))).toBe(12.5);
    });
  });
});
