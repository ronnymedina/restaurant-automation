import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { TimezoneService } from './timezone.service';
import {
  RestaurantNotFoundException,
  TimezoneNotAvailableForCountryException,
} from './exceptions/restaurants.exceptions';

const mockRepo = {
  findByIdWithSettings: jest.fn(),
  findBySlug: jest.fn(),
  updateWithSettings: jest.fn(),
};
const mockTimezoneService = { invalidate: jest.fn() };

const makeRestaurant = (overrides: Partial<{ name: string; slug: string }> = {}) => ({
  id: 'r1',
  name: 'Original',
  slug: 'original',
  ...overrides,
  settings: {
    timezone: 'America/Santiago',
    country: 'CL',
    currency: 'CLP',
    decimalSeparator: ',',
    thousandsSeparator: '.',
  },
});

describe('RestaurantsService.updateSettings', () => {
  let service: RestaurantsService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: RestaurantRepository, useValue: mockRepo },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();
    service = moduleRef.get(RestaurantsService);
    jest.clearAllMocks();
    mockRepo.findBySlug.mockResolvedValue(null);
    mockRepo.updateWithSettings.mockImplementation(async (id, _data) => makeRestaurant({ name: 'Original' }));
  });

  it('updates currency (passthrough; no timezone or name changes)', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { currency: 'USD' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: {},
      settings: { currency: 'USD' },
    });
    expect(mockTimezoneService.invalidate).not.toHaveBeenCalled();
  });

  it('updates timezone when it belongs to the current country', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { timezone: 'Pacific/Easter' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: {},
      settings: { timezone: 'Pacific/Easter' },
    });
  });

  it('throws TimezoneNotAvailableForCountry when timezone does not belong to country', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await expect(
      service.updateSettings('r1', { timezone: 'America/New_York' }),
    ).rejects.toThrow(TimezoneNotAvailableForCountryException);

    expect(mockRepo.updateWithSettings).not.toHaveBeenCalled();
  });

  it('throws TimezoneNotAvailableForCountry for unknown IANA strings', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await expect(
      service.updateSettings('r1', { timezone: 'Mars/Olympus' }),
    ).rejects.toThrow(TimezoneNotAvailableForCountryException);
  });

  it('invalidates timezone cache when timezone changes', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { timezone: 'Pacific/Easter' });

    expect(mockTimezoneService.invalidate).toHaveBeenCalledWith('r1');
  });

  it('does NOT invalidate cache when timezone equals current value', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { timezone: 'America/Santiago' });

    expect(mockTimezoneService.invalidate).not.toHaveBeenCalled();
  });

  it('derives thousandsSeparator from decimalSeparator (. → ,)', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { decimalSeparator: '.' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: {},
      settings: { decimalSeparator: '.', thousandsSeparator: ',' },
    });
  });

  it('derives thousandsSeparator from decimalSeparator (, → .)', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { decimalSeparator: ',' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: {},
      settings: { decimalSeparator: ',', thousandsSeparator: '.' },
    });
  });

  it('regenerates slug when name changes', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant({ name: 'Original', slug: 'original' }));

    await service.updateSettings('r1', { name: 'Nuevo Nombre' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: { name: 'Nuevo Nombre', slug: expect.stringMatching(/^nuevo-nombre/) },
      settings: {},
    });
  });

  it('does NOT regenerate slug when name equals current', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant({ name: 'Original', slug: 'original' }));

    await service.updateSettings('r1', { name: 'Original' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: { name: 'Original' },
      settings: {},
    });
  });

  it('throws RestaurantNotFoundException when restaurant does not exist', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(null);

    await expect(service.updateSettings('missing', { currency: 'USD' }))
      .rejects.toThrow(RestaurantNotFoundException);

    expect(mockRepo.updateWithSettings).not.toHaveBeenCalled();
  });

  it('throws RestaurantNotFoundException when settings row is missing', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue({ ...makeRestaurant(), settings: null });

    await expect(service.updateSettings('r1', { currency: 'USD' }))
      .rejects.toThrow(RestaurantNotFoundException);
  });

  it('empty body is a no-op (calls repo with empty partials)', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', {});

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: {},
      settings: {},
    });
  });
});
