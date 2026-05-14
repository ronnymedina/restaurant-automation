import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TimezoneService } from '../restaurants/timezone.service';

const mockOrdersService = { findByRestaurantId: jest.fn() };
const mockTimezoneService = { getTimezone: jest.fn().mockResolvedValue('UTC') };
const user = { restaurantId: 'r1' };

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();
    controller = module.get<OrdersController>(OrdersController);
    jest.clearAllMocks();
    mockOrdersService.findByRestaurantId.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('defaults limit to 100 when not provided', async () => {
      await controller.findAll(user);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', undefined, 100, undefined, undefined,
      );
    });

    it('caps limit at 100', async () => {
      await controller.findAll(user, undefined, undefined, undefined, '500');
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', undefined, 100, undefined, undefined,
      );
    });

    it('passes statuses array to service', async () => {
      await controller.findAll(user, undefined, undefined, undefined, undefined, ['CREATED', 'PROCESSING']);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined, undefined,
      );
    });

    it('normalizes single string statuses param to one-element array', async () => {
      await controller.findAll(user, undefined, undefined, undefined, undefined, 'CREATED' as any);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED], 100, undefined, undefined,
      );
    });

    it('merges singular status param into statuses array', async () => {
      await controller.findAll(user, undefined, undefined, OrderStatus.CREATED, undefined, ['PROCESSING']);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.PROCESSING, OrderStatus.CREATED], 100, undefined, undefined,
      );
    });

    it('does not duplicate singular status already present in statuses array', async () => {
      await controller.findAll(user, undefined, undefined, OrderStatus.CREATED, undefined, ['CREATED', 'PROCESSING']);
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined, undefined,
      );
    });

    it('throws BadRequestException for invalid status value in statuses param', async () => {
      await expect(
        controller.findAll(user, undefined, undefined, undefined, undefined, ['INVALID'] as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes undefined statuses when no status params provided', async () => {
      await controller.findAll(user, 'session-1');
      expect(mockOrdersService.findByRestaurantId).toHaveBeenCalledWith(
        'r1', undefined, 100, 'session-1', undefined,
      );
    });
  });
});
