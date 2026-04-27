import { Test } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { TimezoneService } from './timezone.service';
import { CACHE_SERVICE } from '../cache/cache.interface';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  restaurantSettings: { findUnique: jest.fn() },
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

describe('TimezoneService', () => {
  let service: TimezoneService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TimezoneService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_SERVICE, useValue: mockCache },
      ],
    }).compile();
    service = module.get(TimezoneService);
  });

  describe('getTimezone', () => {
    it('returns cached value without hitting the DB', async () => {
      mockCache.get.mockResolvedValue('America/Mexico_City');

      const tz = await service.getTimezone('rest-1');

      expect(tz).toBe('America/Mexico_City');
      expect(mockPrisma.restaurantSettings.findUnique).not.toHaveBeenCalled();
    });

    it('queries DB on cache miss and stores result in cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue({ timezone: 'America/Santiago' });

      const tz = await service.getTimezone('rest-2');

      expect(tz).toBe('America/Santiago');
      expect(mockCache.set).toHaveBeenCalledWith('timezone:rest-2', 'America/Santiago');
    });

    it('throws InternalServerErrorException when settings row is missing', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue(null);

      await expect(service.getTimezone('rest-3')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('invalidate', () => {
    it('deletes the cache entry for the restaurant', async () => {
      await service.invalidate('rest-1');
      expect(mockCache.del).toHaveBeenCalledWith('timezone:rest-1');
    });
  });
});
