// apps/ui/src/components/dash/orders/CreateOrderStep3.test.ts
import { describe, it, expect } from 'vitest';
import { detectContactType } from './CreateOrderStep3';

describe('detectContactType', () => {
  it('returns "email" when value contains @', () => {
    expect(detectContactType('user@example.com')).toBe('email');
  });

  it('returns "phone" when value has no @', () => {
    expect(detectContactType('555-1234')).toBe('phone');
  });

  it('returns "phone" for a plain number string', () => {
    expect(detectContactType('1234567890')).toBe('phone');
  });
});
