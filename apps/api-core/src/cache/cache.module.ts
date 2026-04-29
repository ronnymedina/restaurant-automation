import { Module } from '@nestjs/common';
import { CACHE_SERVICE } from './cache.interface';
import { InMemoryCacheService } from './in-memory-cache.service';
import { RedisCacheService } from './redis-cache.service';
import { CACHE_DRIVER, REDIS_URL } from '../config';

@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useFactory: () => {
        if (CACHE_DRIVER === 'redis') {
          return new RedisCacheService(REDIS_URL);
        }
        return new InMemoryCacheService();
      },
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
