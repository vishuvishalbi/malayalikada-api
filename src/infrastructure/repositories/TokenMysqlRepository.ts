import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { IAuthToken, TokenUserType } from '../../domain/entities/AuthToken';
import { ITokenRepository } from '../../domain/repositories/ITokenRepository';

// Expiry is always computed by the database clock (relative seconds), so it
// never depends on the Node process and MySQL sharing a timezone.
export class TokenMysqlRepository implements ITokenRepository {
  async save(jti: string, userType: TokenUserType, userId: number, ttlSeconds: number): Promise<void> {
    await db.query(
      'INSERT INTO auth_tokens (jti, user_type, user_id, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
      [jti, userType, userId, ttlSeconds]
    );
  }

  async findActive(jti: string): Promise<IAuthToken | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT user_type, user_id FROM auth_tokens WHERE jti = ? AND expires_at > NOW()',
      [jti]
    );
    return (rows[0] as IAuthToken) || null;
  }

  async expireSoon(jti: string, graceSeconds: number): Promise<void> {
    await db.query(
      'UPDATE auth_tokens SET expires_at = LEAST(expires_at, DATE_ADD(NOW(), INTERVAL ? SECOND)) WHERE jti = ?',
      [graceSeconds, jti]
    );
  }

  async revoke(jti: string): Promise<void> {
    await db.query('DELETE FROM auth_tokens WHERE jti = ?', [jti]);
  }

  async purgeExpired(limit: number): Promise<void> {
    await db.query('DELETE FROM auth_tokens WHERE expires_at < NOW() LIMIT ?', [limit]);
  }
}
