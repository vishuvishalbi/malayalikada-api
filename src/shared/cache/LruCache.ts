/** Bounded in-memory cache: least-recently-used eviction plus an absolute TTL (reads never extend it). */
export class LruCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return undefined;
    this.entries.set(key, entry); // re-insert: Map order doubles as recency order
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    if (this.entries.size > this.maxSize) {
      this.entries.delete(this.entries.keys().next().value as K);
    }
  }

  deleteWhere(predicate: (value: V) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (predicate(entry.value)) this.entries.delete(key);
    }
  }
}
