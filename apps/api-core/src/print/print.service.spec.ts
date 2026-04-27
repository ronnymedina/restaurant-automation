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

  // ── generateReceipt ────────────────────────────────────────────────────────

  describe('generateReceipt', () => {
    it('throws EntityNotFoundException when order does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.generateReceipt('bad-id')).rejects.toThrow(EntityNotFoundException);
    });

    it('throws EntityNotFoundException when restaurant does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(null);
      await expect(service.generateReceipt('o1')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns a well-formed receipt with all fields', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);

      const receipt = await service.generateReceipt('o1');

      expect(receipt.restaurantName).toBe('Test Restaurant');
      expect(receipt.orderNumber).toBe(42);
      expect(receipt.totalAmount).toBe(25.5);
      expect(receipt.paymentMethod).toBe('CASH');
      expect(receipt.customerEmail).toBe('client@test.com');
      expect(receipt.items).toHaveLength(2);
    });

    it('maps items with product name, quantity, unitPrice and subtotal', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);

      const receipt = await service.generateReceipt('o1');
      const [first] = receipt.items;

      expect(first.productName).toBe('Hamburguesa Clásica');
      expect(first.quantity).toBe(2);
      expect(first.unitPrice).toBe(8.5);
      expect(first.subtotal).toBe(17.0);
      expect(first.notes).toBe('Sin cebolla');
    });

    it('omits notes field when item has no notes', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);

      const receipt = await service.generateReceipt('o1');
      const second = receipt.items[1];

      expect(second.notes).toBeUndefined();
    });

    it('omits customerEmail when order has none', async () => {
      mockOrderRepository.findById.mockResolvedValue({ ...mockOrderWithItems, customerEmail: null });
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);

      const receipt = await service.generateReceipt('o1');
      expect(receipt.customerEmail).toBeUndefined();
    });

    it('falls back to "UNKNOWN" when paymentMethod is null', async () => {
      mockOrderRepository.findById.mockResolvedValue({ ...mockOrderWithItems, paymentMethod: null });
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);

      const receipt = await service.generateReceipt('o1');
      expect(receipt.paymentMethod).toBe('UNKNOWN');
    });
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

  // ── generateBoth ──────────────────────────────────────────────────────────

  describe('generateBoth', () => {
    beforeEach(() => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);
    });

    it('returns both receipt and kitchenTicket', async () => {
      const result = await service.generateBoth('o1');

      expect(result.receipt).toBeDefined();
      expect(result.kitchenTicket).toBeDefined();
    });

    it('receipt and kitchenTicket share the same orderNumber', async () => {
      const result = await service.generateBoth('o1');

      expect(result.receipt.orderNumber).toBe(result.kitchenTicket.orderNumber);
    });

    it('receipt contains totalAmount but kitchenTicket does not', async () => {
      const result = await service.generateBoth('o1');

      expect(result.receipt.totalAmount).toBeDefined();
      expect((result.kitchenTicket as any).totalAmount).toBeUndefined();
    });

    it('throws EntityNotFoundException when order does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.generateBoth('bad-id')).rejects.toThrow(EntityNotFoundException);
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

  // ── printReceipt ──────────────────────────────────────────────────────────

  describe('printReceipt', () => {
    it('returns success: true (stub)', async () => {
      mockOrderRepository.findById.mockResolvedValue(mockOrderWithItems);
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue(mockRestaurant);

      const result = await service.printReceipt('o1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('42');
    });

    it('throws when order does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.printReceipt('bad-id')).rejects.toThrow(EntityNotFoundException);
    });
  });
});
