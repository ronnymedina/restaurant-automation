import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RestaurantResourceGuard, RESOURCE_MODEL_KEY } from './restaurant-resource.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../exceptions';

const mockPrisma = {
  category: {
    findFirst: jest.fn(),
  },
};

const buildContext = (params: Record<string, string>, user: object): ExecutionContext => ({
  switchToHttp: () => ({
    getRequest: () => ({ params, user }),
  }),
  getHandler: () => ({}),
  getClass: () => ({}),
} as unknown as ExecutionContext);

describe('RestaurantResourceGuard', () => {
  let guard: RestaurantResourceGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RestaurantResourceGuard,
        { provide: PrismaService, useValue: mockPrisma },
        Reflector,
      ],
    }).compile();

    guard = module.get(RestaurantResourceGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('returns true when no model metadata (guard not applied)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const ctx = buildContext({ id: '1' }, { restaurantId: 'r1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when resource belongs to restaurant', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('category');
    mockPrisma.category.findFirst.mockResolvedValue({ id: '1', restaurantId: 'r1' });
    const ctx = buildContext({ id: '1' }, { restaurantId: 'r1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws EntityNotFoundException when resource not found', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('category');
    mockPrisma.category.findFirst.mockResolvedValue(null);
    const ctx = buildContext({ id: '999' }, { restaurantId: 'r1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(EntityNotFoundException);
  });
});
