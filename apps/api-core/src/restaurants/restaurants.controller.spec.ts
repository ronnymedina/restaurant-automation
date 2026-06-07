import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { DEFAULT_RESTAURANT_SETTINGS } from './dto/restaurant-settings.dto';

const mockRestaurantsService = {
  findByIdWithSettings: jest.fn(),
  updateSettings: jest.fn(),
};

describe('RestaurantsController', () => {
  let controller: RestaurantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [{ provide: RestaurantsService, useValue: mockRestaurantsService }],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns full shape (name, slug, settings) when restaurant + settings exist', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
        id: 'r1',
        name: 'Mi Resto',
        slug: 'mi-resto',
        settings: {
          timezone: 'America/Santiago',
          country: 'CL',
          currency: 'CLP',
          decimalSeparator: ',',
          thousandsSeparator: '.',
        },
      });

      const result = await controller.getSettings({ restaurantId: 'r1' });

      expect(result).toEqual({
        name: 'Mi Resto',
        slug: 'mi-resto',
        timezone: 'America/Santiago',
        country: 'CL',
        currency: 'CLP',
        decimalSeparator: ',',
        thousandsSeparator: '.',
      });
    });

    it('returns defaults when restaurant has no settings row', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({ id: 'r1', name: 'X', slug: 'x', settings: null });
      const result = await controller.getSettings({ restaurantId: 'r1' });
      expect(result).toEqual(DEFAULT_RESTAURANT_SETTINGS);
    });
  });

  describe('updateSettings', () => {
    it('delegates to service with restaurantId from JWT and the DTO', async () => {
      const updated = {
        name: 'Nuevo',
        slug: 'nuevo',
        timezone: 'America/Santiago',
        country: 'CL',
        currency: 'USD',
        decimalSeparator: ',',
        thousandsSeparator: '.',
      };
      mockRestaurantsService.updateSettings.mockResolvedValue(updated);

      const result = await controller.updateSettings({ restaurantId: 'r1' }, { name: 'Nuevo', currency: 'USD' });

      expect(mockRestaurantsService.updateSettings).toHaveBeenCalledWith('r1', { name: 'Nuevo', currency: 'USD' });
      expect(result).toEqual(updated);
    });
  });
});
