import { ProductRepository } from '../product.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { Test } from '@nestjs/testing';

const mockFindMany = jest.fn().mockResolvedValue([]);
const mockCount = jest.fn().mockResolvedValue(0);

const mockPrisma = {
  product: {
    findMany: mockFindMany,
    count: mockCount,
  },
};

describe('ProductRepository - findByRestaurantIdPaginated', () => {
  let repo: ProductRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProductRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<ProductRepository>(ProductRepository);
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('omits OR clause when search is undefined', async () => {
    await repo.findByRestaurantIdPaginated('rest-1', 0, 10);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ OR: expect.anything() }),
      }),
    );
  });

  it('adds OR clause for name and sku when search is provided', async () => {
    await repo.findByRestaurantIdPaginated('rest-1', 0, 10, 'burger');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          restaurantId: 'rest-1',
          deletedAt: null,
          OR: [
            { name: { contains: 'burger', mode: 'insensitive' } },
            { sku:  { contains: 'burger', mode: 'insensitive' } },
          ],
        }),
      }),
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'burger', mode: 'insensitive' } },
            { sku:  { contains: 'burger', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });
});
