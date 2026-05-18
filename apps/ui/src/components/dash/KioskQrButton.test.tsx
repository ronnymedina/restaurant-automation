import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KioskQrButton from './KioskQrButton';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../lib/kiosk-qr', () => ({
  getOrGenerateQR: vi.fn().mockResolvedValue('data:image/png;base64,QR'),
}));

vi.mock('../../config', () => ({
  config: { storefrontUrl: 'https://app.example.com' },
}));

import { apiFetch } from '../../lib/api';
import { getOrGenerateQR } from '../../lib/kiosk-qr';

const mockMe = (slug: string) =>
  vi.mocked(apiFetch).mockResolvedValue({
    ok: true,
    json: async () => ({ restaurant: { slug }, email: 'admin@test.com' }),
  } as Response);

describe('KioskQrButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing while loading slug', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<KioskQrButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when slug is missing', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ restaurant: null }),
    } as Response);

    const { container } = render(<KioskQrButton />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows the button after slug loads', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    expect(await screen.findByRole('button', { name: /ver qr y enlace/i })).toBeInTheDocument();
  });

  it('opens modal when button is clicked', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    fireEvent.click(await screen.findByRole('button', { name: /ver qr y enlace/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('https://app.example.com/kiosk?slug=mi-resto')).toBeInTheDocument();
  });

  it('calls getOrGenerateQR when modal opens', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    fireEvent.click(await screen.findByRole('button', { name: /ver qr y enlace/i }));
    await waitFor(() => {
      expect(getOrGenerateQR).toHaveBeenCalledWith(
        'mi-resto',
        'https://app.example.com/kiosk?slug=mi-resto',
      );
    });
  });

  it('closes modal when × is clicked', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    fireEvent.click(await screen.findByRole('button', { name: /ver qr y enlace/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
