import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantRepository } from './restaurant.repository';
import { PrismaService } from '../prisma/prisma.service';

const restaurantUpdate = jest.fn();
const settingsUpdate = jest.fn();
const findUniqueOrThrow = jest.fn();

const mockPrisma = {
  $transaction: jest.fn((cb: (tx: any) => any) =>
    cb({
      restaurant: { update: restaurantUpdate, findUniqueOrThrow },
      restaurantSettings: { update: settingsUpdate },
    }),
  ),
};

describe('RestaurantRepository.updateWithSettings', () => {
  let repo: RestaurantRepository;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    repo = moduleRef.get(RestaurantRepository);
    jest.clearAllMocks();
  });

  it('updates restaurant and settings in a single transaction', async () => {
    findUniqueOrThrow.mockResolvedValue({ id: 'r1', name: 'Nuevo', slug: 'nuevo', settings: {} });

    await repo.updateWithSettings('r1', {
      restaurant: { name: 'Nuevo', slug: 'nuevo' },
      settings: { timezone: 'America/Santiago' },
    });

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { name: 'Nuevo', slug: 'nuevo' },
    });
    expect(settingsUpdate).toHaveBeenCalledWith({
      where: { restaurantId: 'r1' },
      data: { timezone: 'America/Santiago' },
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'r1' },
      include: { settings: true },
    });
  });

  it('skips restaurant update when restaurant partial is empty', async () => {
    findUniqueOrThrow.mockResolvedValue({});
    await repo.updateWithSettings('r1', {
      restaurant: {},
      settings: { currency: 'USD' },
    });
    expect(restaurantUpdate).not.toHaveBeenCalled();
    expect(settingsUpdate).toHaveBeenCalled();
  });

  it('skips settings update when settings partial is empty', async () => {
    findUniqueOrThrow.mockResolvedValue({});
    await repo.updateWithSettings('r1', {
      restaurant: { name: 'X' },
      settings: {},
    });
    expect(settingsUpdate).not.toHaveBeenCalled();
    expect(restaurantUpdate).toHaveBeenCalled();
  });

  it('uses restaurantId in the settings WHERE clause (multi-tenant safety)', async () => {
    findUniqueOrThrow.mockResolvedValue({});
    await repo.updateWithSettings('r1', {
      restaurant: {},
      settings: { country: 'US' },
    });
    expect(settingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: 'r1' } }),
    );
  });
});
