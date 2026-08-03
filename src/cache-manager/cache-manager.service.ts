import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheManagerService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  setKey(key: string, value: any, ttl?: number) {
    return this.cacheManager.set(key, value, ttl);
  }

  getKey(key: string) {
    return this.cacheManager.get(key);
  }

  delKey(key: string) {
    return this.cacheManager.del(key);
  }
}
