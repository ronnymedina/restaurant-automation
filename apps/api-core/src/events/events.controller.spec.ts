import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';

import { EventsController } from './events.controller';
import { SseService } from './sse.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { KitchenTokenService } from '../kitchen/kitchen-token.service';

const mockStream = of({ data: {} });

const mockSseService = {
  streamForRestaurant: jest.fn().mockReturnValue(mockStream),
  streamForKitchen: jest.fn().mockReturnValue(mockStream),
};

const mockRestaurantsService = {
  findBySlugWithSettings: jest.fn(),
};

describe('EventsController', () => {
  let controller: EventsController;
  let tokenService: KitchenTokenService;
  let plainToken: string;
  let tokenHash: string;

  beforeEach(async () => {
    jest.clearAllMocks();

    tokenService = new KitchenTokenService();
    ({ plainToken, tokenHash } = tokenService.generate());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: SseService, useValue: mockSseService },
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: KitchenTokenService, useValue: tokenService },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  describe('dashboard', () => {
    it('returns stream using restaurantId from the authenticated user', () => {
      const result = controller.dashboard({ restaurantId: 'rest-1' });

      expect(mockSseService.streamForRestaurant).toHaveBeenCalledWith('rest-1');
      expect(result).toBe(mockStream);
    });
  });

  describe('kitchen', () => {
    it('returns stream when header token and slug are valid', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue({
        id: 'rest-1',
        settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
      });

      const result = await controller.kitchen(plainToken, 'my-slug');

      expect(mockRestaurantsService.findBySlugWithSettings).toHaveBeenCalledWith('my-slug');
      expect(mockSseService.streamForKitchen).toHaveBeenCalledWith('rest-1');
      expect(result).toBe(mockStream);
    });

    it('throws UnauthorizedException when header token is missing', async () => {
      await expect(controller.kitchen(undefined, 'my-slug')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRestaurantsService.findBySlugWithSettings).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when slug is missing', async () => {
      await expect(controller.kitchen(plainToken, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRestaurantsService.findBySlugWithSettings).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when token does not match', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue({
        id: 'rest-1',
        settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
      });

      await expect(controller.kitchen('wrong-token', 'my-slug')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when kitchen token is expired', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue({
        id: 'rest-1',
        settings: {
          kitchenTokenHash: tokenHash,
          kitchenTokenExpiresAt: new Date('2000-01-01'),
        },
      });

      await expect(controller.kitchen(plainToken, 'my-slug')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when slug is not found', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(null);

      await expect(controller.kitchen(plainToken, 'unknown-slug')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
