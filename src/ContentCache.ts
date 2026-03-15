/**
 * ContentCache stores the last-known content of each file by URI.
 * Used to compute diffs between the "before" and "after" states on save.
 */
export class ContentCache {
  private _cache = new Map<string, string>();

  /** Get cached content for a file URI. Returns undefined if not yet cached. */
  get(uri: string): string | undefined {
    return this._cache.get(uri);
  }

  /** Update the cached content for a file URI. */
  set(uri: string, content: string): void {
    this._cache.set(uri, content);
  }

  /** Check if a file URI has cached content. */
  has(uri: string): boolean {
    return this._cache.has(uri);
  }

  /** Remove a file from the cache. */
  delete(uri: string): boolean {
    return this._cache.delete(uri);
  }

  /** Clear all cached content. */
  clear(): void {
    this._cache.clear();
  }

  /** Number of files in the cache. */
  get size(): number {
    return this._cache.size;
  }
}
