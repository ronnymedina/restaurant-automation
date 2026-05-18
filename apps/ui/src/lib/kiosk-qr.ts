import QRCode from 'qrcode';

export const QR_CACHE_KEY = (slug: string) => `kiosk-qr-${slug}`;

export async function getOrGenerateQR(slug: string, kioskUrl: string): Promise<string> {
  const cached = localStorage.getItem(QR_CACHE_KEY(slug));
  if (cached) return cached;

  const dataUrl = await QRCode.toDataURL(kioskUrl, { width: 240, margin: 2 });
  localStorage.setItem(QR_CACHE_KEY(slug), dataUrl);
  return dataUrl;
}
