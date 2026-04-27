import { InMemoryCacheService } from './in-memory-cache.service';

describe('InMemoryCacheService', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
  });

  it('returns null for a missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    await cache.set('k', 'hello');
    expect(await cache.get('k')).toBe('hello');
  });

  it('deletes a value', async () => {
    await cache.set('k', 'hello');
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('overwrites an existing value', async () => {
    await cache.set('k', 'first');
    await cache.set('k', 'second');
    expect(await cache.get('k')).toBe('second');
  });

  it('expires a value after ttl elapses', async () => {
    jest.useFakeTimers();
    await cache.set('k', 'v', 1); // 1 second TTL
    jest.advanceTimersByTime(1001);
    expect(await cache.get('k')).toBeNull();
    jest.useRealTimers();
  });

  it('does not expire a value before ttl elapses', async () => {
    jest.useFakeTimers();
    await cache.set('k', 'v', 10);
    jest.advanceTimersByTime(9000);
    expect(await cache.get('k')).toBe('v');
    jest.useRealTimers();
  });

  it('del on non-existent key does not throw', async () => {
    await expect(cache.del('ghost')).resolves.toBeUndefined();
  });
});
