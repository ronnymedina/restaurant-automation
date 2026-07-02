jest.mock('../../config', () => ({ SINGLE_RESTAURANT_MODE: false }));

import { OnboardingOpenGuard } from './onboarding-open.guard';
import type { RestaurantsService } from '../../restaurants/restaurants.service';

describe('OnboardingOpenGuard (SINGLE_RESTAURANT_MODE=false)', () => {
  it('permite sin consultar la base (no llama a count())', async () => {
    const count = jest.fn();
    const service = { count } as unknown as RestaurantsService;
    const guard = new OnboardingOpenGuard(service);

    await expect(guard.canActivate({} as never)).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });
});
