import { describe, it, expect } from 'vitest';
import { LruCache } from './LruCache';

function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('LruCache', () => {
  it('returns a stored value until its ttl elapses', () => {
    const clock = makeClock();
    const cache = new LruCache<string, number>(10, 1000, clock.now);
    cache.set('a', 1);
    clock.advance(999);
    expect(cache.get('a')).toBe(1);
    clock.advance(1);
    expect(cache.get('a')).toBeUndefined();
  });

  it('does not extend the ttl when an entry is read', () => {
    const clock = makeClock();
    const cache = new LruCache<string, number>(10, 1000, clock.now);
    cache.set('a', 1);
    clock.advance(600);
    expect(cache.get('a')).toBe(1);
    clock.advance(600);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry when over capacity', () => {
    const cache = new LruCache<string, number>(2, 1000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now the most recently used
    cache.set('c', 3); // evicts b
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('deleteWhere removes only the entries matching the predicate', () => {
    const cache = new LruCache<string, { user: number }>(10, 1000);
    cache.set('t1', { user: 1 });
    cache.set('t2', { user: 2 });
    cache.set('t3', { user: 1 });
    cache.deleteWhere((v) => v.user === 1);
    expect(cache.get('t1')).toBeUndefined();
    expect(cache.get('t3')).toBeUndefined();
    expect(cache.get('t2')).toEqual({ user: 2 });
  });
});
