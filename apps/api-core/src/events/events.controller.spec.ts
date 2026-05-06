import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { of } from 'rxjs';

import { EventsController } from './events.controller';
import { SseService } from './sse.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

const mockStream = of({ data: {} });

const mockSseService = {
  streamForRestaurant: jest.fn().mockReturnValue(mockStream),
  streamForKitchen: jest.fn().mockReturnValue(mockStream),
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockRestaurantsService = {
  findBySlugWithSettings: jest.fn(),
};

describe('EventsController', () => {
  let controller: EventsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: SseService, useValue: mockSseService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RestaurantsService, useValue: mockRestaurantsService },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  describe('dashboard', () => {
    it('returns stream when JWT is valid', () => {
      mockJwtService.verify.mockReturnValue({ restaurantId: 'rest-1' });

      const result = controller.dashboard('valid-token');

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(mockSseService.streamForRestaurant).toHaveBeenCalledWith('rest-1');
      expect(result).toBe(mockStream);
    });

    it('throws UnauthorizedException when token is missing', () => {
      expect(() => controller.dashboard(undefined as unknown as string)).toThrow(
        UnauthorizedException,
      );
      expect(mockJwtService.verify).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when JWT is invalid', () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      expect(() => controller.dashboard('bad-token')).toThrow(UnauthorizedException);
    });
  });

  describe('kitchen', () => {
    const validRestaurant = {
      id: 'rest-1',
      settings: {
        kitchenToken: 'secret-token',
        kitchenTokenExpiresAt: null,
      },
    };

    it('returns stream when token and slug are valid', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(validRestaurant);

      const result = await controller.kitchen('secret-token', 'my-slug');

      expect(mockRestaurantsService.findBySlugWithSettings).toHaveBeenCalledWith('my-slug');
      expect(mockSseService.streamForKitchen).toHaveBeenCalledWith('rest-1');
      expect(result).toBe(mockStream);
    });

    it('throws UnauthorizedException when token does not match', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(validRestaurant);

      await expect(controller.kitchen('wrong-token', 'my-slug')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when kitchen token is expired', async () => {
      const expiredRestaurant = {
        id: 'rest-1',
        settings: {
          kitchenToken: 'secret-token',
          kitchenTokenExpiresAt: new Date('2000-01-01'),
        },
      };
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(expiredRestaurant);

      await expect(controller.kitchen('secret-token', 'my-slug')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when slug is not found', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(null);

      await expect(controller.kitchen('secret-token', 'unknown-slug')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
