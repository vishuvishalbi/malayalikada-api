import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../database/connection', () => ({
  db: { query: (...args: any[]) => query(...args) },
}));

import { TokenMysqlRepository } from './TokenMysqlRepository';

beforeEach(() => {
  query.mockReset();
});

describe('TokenMysqlRepository', () => {
  it('save registers the jti with an expiry computed by the database clock', async () => {
    query.mockResolvedValue([{}, undefined]);
    await new TokenMysqlRepository().save('jti-1', 'customer', 7, 2592000);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO auth_tokens/);
    expect(sql).toMatch(/DATE_ADD\(NOW\(\), INTERVAL \? SECOND\)/);
    expect(params).toEqual(['jti-1', 'customer', 7, 2592000]);
  });

  it('findActive returns null for an unknown or expired token', async () => {
    query.mockResolvedValue([[], undefined]);
    expect(await new TokenMysqlRepository().findActive('jti-1')).toBeNull();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/expires_at > NOW\(\)/);
    expect(params).toEqual(['jti-1']);
  });

  it('findActive returns the owner of a live token', async () => {
    query.mockResolvedValue([[{ user_type: 'staff', user_id: 3 }], undefined]);
    expect(await new TokenMysqlRepository().findActive('jti-1')).toEqual({ user_type: 'staff', user_id: 3 });
  });

  it('expireSoon only ever shortens the expiry', async () => {
    query.mockResolvedValue([{}, undefined]);
    await new TokenMysqlRepository().expireSoon('jti-1', 600);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/LEAST\(expires_at, DATE_ADD\(NOW\(\), INTERVAL \? SECOND\)\)/);
    expect(params).toEqual([600, 'jti-1']);
  });

  it('purgeExpired deletes a bounded batch', async () => {
    query.mockResolvedValue([{}, undefined]);
    await new TokenMysqlRepository().purgeExpired(100);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM auth_tokens WHERE expires_at < NOW\(\) LIMIT \?/);
    expect(params).toEqual([100]);
  });

  it('revoke deletes exactly that token', async () => {
    query.mockResolvedValue([{}, undefined]);
    await new TokenMysqlRepository().revoke('jti-1');
    expect(query).toHaveBeenCalledWith('DELETE FROM auth_tokens WHERE jti = ?', ['jti-1']);
  });
});
