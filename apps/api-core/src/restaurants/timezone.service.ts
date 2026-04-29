import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ICacheService } from '../cache/cache.interface';
import { CACHE_SERVICE } from '../cache/cache.interface';

@Injectable()
export class TimezoneService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async getTimezone(restaurantId: string): Promise<string> {
    const cacheKey = `timezone:${restaurantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { timezone: true },
    });

    if (!settings) {
      throw new InternalServerErrorException(
        `Restaurant ${restaurantId} has no settings — was it created via createRestaurant()?`,
      );
    }

    await this.cache.set(cacheKey, settings.timezone);
    return settings.timezone;
  }

  async invalidate(restaurantId: string): Promise<void> {
    await this.cache.del(`timezone:${restaurantId}`);
  }
}
