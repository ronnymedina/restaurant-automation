import { registrationOpen } from './onboarding-registration';

describe('registrationOpen', () => {
  it('abierto cuando el flag está apagado, sin importar el count', () => {
    expect(registrationOpen(false, 0)).toBe(true);
    expect(registrationOpen(false, 1)).toBe(true);
    expect(registrationOpen(false, 5)).toBe(true);
  });

  it('abierto con flag encendido y 0 restaurantes (permite el primer registro)', () => {
    expect(registrationOpen(true, 0)).toBe(true);
  });

  it('cerrado con flag encendido y ya existe ≥1 restaurante', () => {
    expect(registrationOpen(true, 1)).toBe(false);
    expect(registrationOpen(true, 3)).toBe(false);
  });
});
