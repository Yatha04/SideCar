import { describe, it, expect, beforeEach } from 'vitest';
import { ContentCache } from '../ContentCache';

describe('ContentCache', () => {
  let cache: ContentCache;

  beforeEach(() => {
    cache = new ContentCache();
  });

  it('returns undefined for unknown URIs', () => {
    expect(cache.get('file:///unknown.ts')).toBeUndefined();
  });

  it('stores and retrieves content', () => {
    cache.set('file:///a.ts', 'hello');
    expect(cache.get('file:///a.ts')).toBe('hello');
  });

  it('overwrites existing content', () => {
    cache.set('file:///a.ts', 'v1');
    cache.set('file:///a.ts', 'v2');
    expect(cache.get('file:///a.ts')).toBe('v2');
  });

  it('reports has correctly', () => {
    expect(cache.has('file:///a.ts')).toBe(false);
    cache.set('file:///a.ts', 'x');
    expect(cache.has('file:///a.ts')).toBe(true);
  });

  it('deletes entries', () => {
    cache.set('file:///a.ts', 'x');
    expect(cache.delete('file:///a.ts')).toBe(true);
    expect(cache.has('file:///a.ts')).toBe(false);
  });

  it('clears all entries', () => {
    cache.set('file:///a.ts', 'a');
    cache.set('file:///b.ts', 'b');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('tracks size', () => {
    expect(cache.size).toBe(0);
    cache.set('file:///a.ts', 'a');
    cache.set('file:///b.ts', 'b');
    expect(cache.size).toBe(2);
  });
});
