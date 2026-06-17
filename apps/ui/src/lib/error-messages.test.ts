import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './error-messages';

describe('getErrorMessage', () => {
  it('mapea los codes del onboarding a mensajes en español', () => {
    expect(getErrorMessage('VALIDATION_ERROR')).toMatch(/no son válidos|datos/i);
    expect(getErrorMessage('EMAIL_ALREADY_EXISTS')).toMatch(/registrado/i);
    expect(getErrorMessage('RESTAURANT_CREATION_FAILED')).toMatch(/registro|restaurante/i);
    expect(getErrorMessage('USER_CREATION_FAILED')).toMatch(/registro|cuenta/i);
    expect(getErrorMessage('DEFAULT_CATEGORY_CREATION_FAILED')).toMatch(/registro/i);
    expect(getErrorMessage('ONBOARDING_FAILED')).toMatch(/registro/i);
  });

  it('cae a un mensaje por defecto para codes desconocidos', () => {
    expect(getErrorMessage('UNKNOWN_CODE')).toMatch(/inesperado/i);
  });
});
