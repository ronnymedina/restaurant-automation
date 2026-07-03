jest.mock('../../config', () => ({ SINGLE_RESTAURANT_MODE: true }));

import { OnboardingOpenGuard } from './onboarding-open.guard';
import { OnboardingClosedException } from '../exceptions/onboarding.exceptions';
// import type: solo lo usamos como tipo. Evita cargar el módulo real de RestaurantsService
// (y sus dependencias) bajo el jest.mock de '../../config'.
import type { RestaurantsService } from '../../restaurants/restaurants.service';

function makeGuard(count: number) {
  const service = { count: jest.fn().mockResolvedValue(count) } as unknown as RestaurantsService;
  return { guard: new OnboardingOpenGuard(service), service };
}

describe('OnboardingOpenGuard (SINGLE_RESTAURANT_MODE=true)', () => {
  it('permite el primer registro (count 0)', async () => {
    const { guard } = makeGuard(0);
    await expect(guard.canActivate({} as never)).resolves.toBe(true);
  });

  it('bloquea cuando ya existe un restaurante (count ≥ 1)', async () => {
    const { guard } = makeGuard(1);
    await expect(guard.canActivate({} as never)).rejects.toBeInstanceOf(OnboardingClosedException);
  });
});
