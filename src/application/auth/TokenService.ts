import { TokenUserType } from '../../domain/entities/AuthToken';
import { ITokenRepository } from '../../domain/repositories/ITokenRepository';
import { LruCache } from '../../shared/cache/LruCache';

const CACHE_MAX_ENTRIES = 10_000;
const CACHE_TTL_MS = 60_000;
const ROTATION_GRACE_SECONDS = 10 * 60;
const PURGE_BATCH = 100;

type CachedOwner = { userType: TokenUserType; userId: number };

/**
 * Server-side registry of issued JWTs: a token is only honoured while its jti
 * is registered to the user it claims. Positive lookups are cached; misses
 * always go to the database, so a revoked token is dead as soon as its row is
 * gone and evicted (the cache TTL bounds staleness across processes).
 */
export class TokenService {
  constructor(
    private readonly repo: ITokenRepository,
    private readonly cache: LruCache<string, CachedOwner> = new LruCache(CACHE_MAX_ENTRIES, CACHE_TTL_MS),
  ) {}

  async issue(jti: string, userType: TokenUserType, userId: number, ttlSeconds: number): Promise<void> {
    await this.repo.save(jti, userType, userId, ttlSeconds);
    await this.repo.purgeExpired(PURGE_BATCH);
  }

  async isActive(jti: string, userType: TokenUserType, userId: number): Promise<boolean> {
    const cached = this.cache.get(jti);
    if (cached) return cached.userType === userType && cached.userId === userId;

    const row = await this.repo.findActive(jti);
    if (!row || row.user_type !== userType || row.user_id !== userId) return false;
    this.cache.set(jti, { userType, userId });
    return true;
  }

  /** The replaced token keeps working briefly so in-flight requests don't 401 mid-rotation. */
  async retire(jti: string): Promise<void> {
    await this.repo.expireSoon(jti, ROTATION_GRACE_SECONDS);
  }

  /** For a token that was just issued (so it can't be cached yet) and must not survive. */
  async revoke(jti: string): Promise<void> {
    await this.repo.revoke(jti);
  }

  evictUser(userType: TokenUserType, userId: number): void {
    this.cache.deleteWhere((owner) => owner.userType === userType && owner.userId === userId);
  }
}
