import { IAuthToken, TokenUserType } from '../entities/AuthToken';

export interface ITokenRepository {
  save(jti: string, userType: TokenUserType, userId: number, ttlSeconds: number): Promise<void>;
  /** The token's owner if it is registered and unexpired, otherwise null. */
  findActive(jti: string): Promise<IAuthToken | null>;
  /** Caps the token's remaining lifetime (never extends it). */
  expireSoon(jti: string, graceSeconds: number): Promise<void>;
  purgeExpired(limit: number): Promise<void>;
  revoke(jti: string): Promise<void>;
}
