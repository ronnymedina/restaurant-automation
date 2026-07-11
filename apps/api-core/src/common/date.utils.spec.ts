import { toUtcBoundary } from './date.utils';

describe('toUtcBoundary', () => {
  describe('UTC timezone', () => {
    it('start of day returns midnight UTC', () => {
      const result = toUtcBoundary('2026-01-15', 'UTC', 'start');
      expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });

    it('end of day returns 23:59:59.999 UTC', () => {
      const result = toUtcBoundary('2026-01-15', 'UTC', 'end');
      expect(result.toISOString()).toBe('2026-01-15T23:59:59.999Z');
    });
  });

  describe('America/Argentina/Buenos_Aires (always UTC-3)', () => {
    it('start of day: local midnight = UTC+3h', () => {
      // 2026-01-15 00:00:00 ART = 2026-01-15 03:00:00 UTC
      const result = toUtcBoundary('2026-01-15', 'America/Argentina/Buenos_Aires', 'start');
      expect(result.toISOString()).toBe('2026-01-15T03:00:00.000Z');
    });

    it('end of day: local 23:59:59.999 ART = next UTC day 02:59:59.999', () => {
      // 2026-01-15 23:59:59.999 ART = 2026-01-16 02:59:59.999 UTC
      const result = toUtcBoundary('2026-01-15', 'America/Argentina/Buenos_Aires', 'end');
      expect(result.toISOString()).toBe('2026-01-16T02:59:59.999Z');
    });
  });

  describe('America/Mexico_City (UTC-6 in January)', () => {
    it('start of day: local midnight = UTC+6h', () => {
      // 2026-01-15 00:00:00 CST = 2026-01-15 06:00:00 UTC
      const result = toUtcBoundary('2026-01-15', 'America/Mexico_City', 'start');
      expect(result.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    });

    it('end of day: local 23:59:59.999 CST = next UTC day 05:59:59.999', () => {
      const result = toUtcBoundary('2026-01-15', 'America/Mexico_City', 'end');
      expect(result.toISOString()).toBe('2026-01-16T05:59:59.999Z');
    });
  });
});
