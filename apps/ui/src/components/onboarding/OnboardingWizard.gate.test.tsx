import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OnboardingWizard from './OnboardingWizard';

describe('OnboardingWizard registration gate', () => {
  beforeEach(() => {
    // window.location.replace no existe en jsdom por defecto; lo stubbeamos.
    Object.defineProperty(window, 'location', {
      value: { replace: vi.fn(), href: '' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirige a /login cuando registrationOpen=false', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/onboarding/status')) {
        return { ok: true, json: async () => ({ registrationOpen: false }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }));

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });
  });

  it('muestra el wizard (fail-open) cuando el chequeo de estado falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    const { findByLabelText } = render(<OnboardingWizard />);

    // El wizard se muestra igual (Step 1 con el campo de email) y no se redirige.
    expect(await findByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
