import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,GENERATED'),
  },
}));

import QRCode from 'qrcode';
import { getOrGenerateQR, QR_CACHE_KEY } from './kiosk-qr';

describe('getOrGenerateQR', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('generates and caches QR when not in localStorage', async () => {
    const result = await getOrGenerateQR('mi-restaurante', 'https://app.com/kiosk?slug=mi-restaurante');

    expect(result).toBe('data:image/png;base64,GENERATED');
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://app.com/kiosk?slug=mi-restaurante',
      { width: 240, margin: 2 },
    );
    expect(localStorage.getItem(QR_CACHE_KEY('mi-restaurante'))).toBe('data:image/png;base64,GENERATED');
  });

  it('returns cached QR from localStorage without regenerating', async () => {
    localStorage.setItem(QR_CACHE_KEY('mi-restaurante'), 'data:image/png;base64,CACHED');

    const result = await getOrGenerateQR('mi-restaurante', 'https://app.com/kiosk?slug=mi-restaurante');

    expect(result).toBe('data:image/png;base64,CACHED');
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
  });

  it('generates separate cache entries for different slugs', async () => {
    vi.mocked(QRCode.toDataURL)
      .mockResolvedValueOnce('data:image/png;base64,QR_A')
      .mockResolvedValueOnce('data:image/png;base64,QR_B');

    await getOrGenerateQR('resto-a', 'https://app.com/kiosk?slug=resto-a');
    await getOrGenerateQR('resto-b', 'https://app.com/kiosk?slug=resto-b');

    expect(localStorage.getItem(QR_CACHE_KEY('resto-a'))).toBe('data:image/png;base64,QR_A');
    expect(localStorage.getItem(QR_CACHE_KEY('resto-b'))).toBe('data:image/png;base64,QR_B');
  });
});
