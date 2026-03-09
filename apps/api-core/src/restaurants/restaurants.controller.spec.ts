import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

const mockRestaurantsService = {
  update: jest.fn(),
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

  describe('rename', () => {
    it('calls service.update with restaurantId and name, returns slug', async () => {
      mockRestaurantsService.update.mockResolvedValue({ id: 'r1', name: 'Nuevo Nombre', slug: 'nuevo-nombre' });
      const user = { restaurantId: 'r1' };
      const result = await controller.rename(user, { name: 'Nuevo Nombre' });
      expect(mockRestaurantsService.update).toHaveBeenCalledWith('r1', { name: 'Nuevo Nombre' });
      expect(result).toEqual({ slug: 'nuevo-nombre' });
    });
  });
});
