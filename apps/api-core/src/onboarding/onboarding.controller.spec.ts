import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { LATAM_COUNTRIES } from './data/latam-countries';
import { RestaurantsService } from '../restaurants/restaurants.service';

describe('OnboardingController.getCountries', () => {
  let controller: OnboardingController;

  beforeEach(() => {
    // getCountries no usa el service; mock vacío suficiente.
    controller = new OnboardingController({} as OnboardingService, {} as RestaurantsService);
  });

  it('devuelve todos los países LatAm', () => {
    expect(controller.getCountries()).toHaveLength(LATAM_COUNTRIES.length);
  });

  it('mapea cada país a { code, name, currency, defaultDecimalSeparator }', () => {
    const cl = controller.getCountries().find((c) => c.code === 'CL');
    expect(cl).toEqual({ code: 'CL', name: 'Chile', currency: 'CLP', defaultDecimalSeparator: ',' });
  });

  it('ordena por name (es)', () => {
    const names = controller.getCountries().map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
  });
});

describe('OnboardingController.getStatus', () => {
  it('registrationOpen=true cuando no hay restaurantes', async () => {
    const restaurants = { count: jest.fn().mockResolvedValue(0) } as unknown as RestaurantsService;
    const controller = new OnboardingController({} as OnboardingService, restaurants);
    await expect(controller.getStatus()).resolves.toEqual({ registrationOpen: true });
  });
});
