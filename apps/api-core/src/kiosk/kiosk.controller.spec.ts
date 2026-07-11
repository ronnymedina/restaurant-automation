import { Test, TestingModule } from '@nestjs/testing';

import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { OrderRepository } from '../orders/order.repository';
import { EntityNotFoundException } from '../common/exceptions';

const mockKioskService = {
  resolveRestaurant: jest.fn(),
};

const mockOrderRepository = {
  findById: jest.fn(),
};

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  orderNumber: 1,
  status: 'CREATED',
  totalAmount: 10,
  restaurantId: 'rest-A',
  items: [],
  createdAt: new Date(),
  ...overrides,
});

describe('KioskController › getOrderStatus (R2-12)', () => {
  let controller: KioskController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KioskController],
      providers: [
        { provide: KioskService, useValue: mockKioskService },
        { provide: OrderRepository, useValue: mockOrderRepository },
      ],
    }).compile();
    controller = module.get(KioskController);
  });

  it('retorna el estado cuando la orden pertenece al restaurante del slug', async () => {
    mockKioskService.resolveRestaurant.mockResolvedValue({ id: 'rest-A' });
    mockOrderRepository.findById.mockResolvedValue(makeOrder({ restaurantId: 'rest-A' }));

    const result = await controller.getOrderStatus('slug-A', 'o1');

    expect(result.id).toBe('o1');
    expect(result.status).toBe('CREATED');
  });

  it('lanza 404 (EntityNotFound) si la orden es de otro restaurante', async () => {
    mockKioskService.resolveRestaurant.mockResolvedValue({ id: 'rest-A' });
    mockOrderRepository.findById.mockResolvedValue(makeOrder({ restaurantId: 'rest-B' }));

    await expect(controller.getOrderStatus('slug-A', 'o1')).rejects.toThrow(EntityNotFoundException);
  });

  it('lanza 404 si la orden no existe', async () => {
    mockKioskService.resolveRestaurant.mockResolvedValue({ id: 'rest-A' });
    mockOrderRepository.findById.mockResolvedValue(null);

    await expect(controller.getOrderStatus('slug-A', 'missing')).rejects.toThrow(EntityNotFoundException);
  });
});
