import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TimezoneService } from '../restaurants/timezone.service';

const mockOrdersService = { listOrders: jest.fn() };
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
    mockOrdersService.listOrders.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('calls service with restaurantId and default limit', async () => {
      await controller.findAll(user, undefined, undefined, 100);
      expect(mockOrdersService.listOrders).toHaveBeenCalledWith(
        'r1', undefined, 100, undefined,
      );
    });

    it('passes statuses array to service', async () => {
      await controller.findAll(user, [OrderStatus.CREATED, OrderStatus.PROCESSING], undefined, 100);
      expect(mockOrdersService.listOrders).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined,
      );
    });

    it('passes orderNumber to service', async () => {
      await controller.findAll(user, undefined, 42, 100);
      expect(mockOrdersService.listOrders).toHaveBeenCalledWith(
        'r1', undefined, 100, 42,
      );
    });
  });
});
