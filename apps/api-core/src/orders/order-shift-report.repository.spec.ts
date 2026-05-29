import { OrderShiftReportRepository } from './order-shift-report.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('OrderShiftReportRepository — restaurantId filter (H-08)', () => {
  let repo: OrderShiftReportRepository;
  let prisma: { order: { groupBy: jest.Mock }; orderItem: { groupBy: jest.Mock }; product: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      order: { groupBy: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repo = new OrderShiftReportRepository(prisma as unknown as PrismaService);
  });

  describe('groupOrdersByShift', () => {
    it('aplica restaurantId al where', async () => {
      await repo.groupOrdersByShift('rest-A', 'shift-1');
      expect(prisma.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cashShiftId: 'shift-1', cashShift: { restaurantId: 'rest-A' } },
        }),
      );
    });
  });

  describe('getTopProductsWithNamesByShift', () => {
    it('aplica restaurantId al where del orderItem groupBy', async () => {
      await repo.getTopProductsWithNamesByShift('rest-A', 'shift-1');
      expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: expect.objectContaining({
              cashShiftId: 'shift-1',
              cashShift: { restaurantId: 'rest-A' },
            }),
          }),
        }),
      );
    });

    it('aplica restaurantId al lookup de nombres de producto', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 3, subtotal: 1000n } },
      ]);
      await repo.getTopProductsWithNamesByShift('rest-A', 'shift-1');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['p1'] }, restaurantId: 'rest-A' },
        }),
      );
    });
  });
});
