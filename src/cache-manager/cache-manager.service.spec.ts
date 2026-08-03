import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheManagerService } from './cache-manager.service';
import { Cache } from 'cache-manager';

describe('CacheManagerService', () => {
  let service: CacheManagerService;
  let cacheManager: Cache;

  beforeEach(async () => {
    const mockCacheManager = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheManagerService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<CacheManagerService>(CacheManagerService);
    cacheManager = module.get<Cache>(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setKey', () => {
    it('should call cacheManager.set with the correct parameters', async () => {
      const key = 'testKey';
      const value = 'testValue';
      const ttl = 1000;

      await service.setKey(key, value, ttl);

      expect(cacheManager.set).toHaveBeenCalledWith(key, value, ttl);
    });

    it('should call cacheManager.set without TTL if not provided', async () => {
      const key = 'testKey';
      const value = 'testValue';

      await service.setKey(key, value);

      expect(cacheManager.set).toHaveBeenCalledWith(key, value, undefined);
    });
  });

  describe('getKey', () => {
    it('should call cacheManager.get with the correct key and return the value', async () => {
      const key = 'testKey';
      const value = 'testValue';

      jest.spyOn(cacheManager, 'get').mockResolvedValue(value);

      const result = await service.getKey(key);

      expect(cacheManager.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(value);
    });

    it('should return undefined if the key does not exist', async () => {
      const key = 'nonExistentKey';

      jest.spyOn(cacheManager, 'get').mockResolvedValue(undefined);

      const result = await service.getKey(key);

      expect(cacheManager.get).toHaveBeenCalledWith(key);
      expect(result).toBeUndefined();
    });
  });

  describe('delKey', () => {
    it('should call cacheManager.del with the correct key', async () => {
      const key = 'testKey';

      await service.delKey(key);

      expect(cacheManager.del).toHaveBeenCalledWith(key);
    });
  });
});
