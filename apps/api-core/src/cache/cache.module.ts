import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE } from './cache.interface';
import { InMemoryCacheService } from './in-memory-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useClass: InMemoryCacheService,
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
