import { Test, TestingModule } from '@nestjs/testing';
import { PrintService } from './print.service';
import { OrderRepository } from '../orders/order.repository';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { EntityNotFoundException } from '../common/exceptions';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockRestaurant = { id: 'r1', name: 'Test Restaurant', settings: { timezone: 'UTC' } };

const mockOrderBase = {
  id: 'o1',
  orderNumber: 42,
  restaurantId: 'r1',
  totalAmount: 25.5,
  paymentMethod: 'CASH',
  customerEmail: 'client@test.com',
  isPaid: false,
  status: 'CREATED',
  createdAt: new Date('2024-01-15T14:00:00Z'),
  updatedAt: new Date('2024-01-15T14:00:00Z'),
};

const mockOrderWithItems = {
  ...mockOrderBase,
  items: [
    {
      id: 'i1',
      quantity: 2,
      unitPrice: 8.5,
      subtotal: 17.0,
      notes: 'Sin cebolla',
      product: { id: 'p1', name: 'Hamburguesa Clásica' },
      menuItem: null,
    },
    {
      id: 'i2',
      quantity: 1,
      unitPrice: 8.5,
      subtotal: 8.5,
      notes: null,
      product: { id: 'p2', name: 'Papas Fritas' },
      menuItem: null,
    },
  ],
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOrderRepository = { findById: jest.fn() };
const mockRestaurantsService = { findById: jest.fn(), findByIdWithSettings: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PrintService', () => {
  let service: PrintService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrintService,
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: RestaurantsService, useValue: mockRestaurantsService },
      ],
    }).compile();

    service = module.get<PrintService>(PrintService);
    jest.clearAllMocks();
  });

  // ── generateKitchenTicket ─────────────────────────────────────────────────

  describe('generateKitchenTicket', () => {
    it('throws EntityNotFoundException when order does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.generateKitchenTicket('bad-id')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns ticket with orderNumber and createdAt', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);

      const ticket = await service.generateKitchenTicket('o1');

      expect(ticket.orderNumber).toBe(42);
      expect(typeof ticket.createdAt).toBe('string');
      expect(ticket.createdAt.length).toBeGreaterThan(0);
    });

    it('includes all items with productName and quantity', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);

      const ticket = await service.generateKitchenTicket('o1');

      expect(ticket.items).toHaveLength(2);
      expect(ticket.items[0].productName).toBe('Hamburguesa Clásica');
      expect(ticket.items[0].quantity).toBe(2);
    });

    it('includes notes when present', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);

      const ticket = await service.generateKitchenTicket('o1');

      expect(ticket.items[0].notes).toBe('Sin cebolla');
    });

    it('omits notes when null', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);

      const ticket = await service.generateKitchenTicket('o1');

      expect(ticket.items[1].notes).toBeUndefined();
    });

    it('does NOT include prices (kitchen ticket has no financial data)', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);

      const ticket = await service.generateKitchenTicket('o1');
      const item = ticket.items[0] as any;

      expect(item.unitPrice).toBeUndefined();
      expect(item.subtotal).toBeUndefined();
      expect((ticket as any).totalAmount).toBeUndefined();
    });
  });

  // ── printKitchenTicket ────────────────────────────────────────────────────

  describe('printKitchenTicket', () => {
    it('returns success: true (stub)', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);

      const result = await service.printKitchenTicket('o1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('42');
    });

    it('throws when order does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.printKitchenTicket('bad-id')).rejects.toThrow(EntityNotFoundException);
    });
  });
});
