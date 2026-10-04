import { describe, it, expect, vi, beforeEach } from 'vitest';

const getConnection = vi.fn();
vi.mock('../database/connection', () => ({
  db: { query: vi.fn(), getConnection: (...args: any[]) => getConnection(...args) },
}));

import { AccountDeletionMysqlRepository } from './AccountDeletionMysqlRepository';

function makeConn(customerRow: any = { id: 7, identifier: 'a@b.co' }) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) =>
    /FROM customers WHERE id = \? FOR UPDATE/.test(sql)
      ? [customerRow ? [customerRow] : [], undefined]
      : [{ affectedRows: 1 }, undefined]);
  return { query, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
}

const sqlOf = (conn: ReturnType<typeof makeConn>) => conn.query.mock.calls.map((c) => c[0] as string);
const callWith = (conn: ReturnType<typeof makeConn>, fragment: string) =>
  conn.query.mock.calls.find((c) => (c[0] as string).includes(fragment));

beforeEach(() => getConnection.mockReset());

describe('AccountDeletionMysqlRepository.anonymizeCustomer', () => {
  it('anonymizes the customer row in place: personal fields cleared, identifier freed, row kept', async () => {
    const conn = makeConn();
    getConnection.mockResolvedValue(conn);

    expect(await new AccountDeletionMysqlRepository().anonymizeCustomer(7)).toBe(true);

    const [sql, params] = callWith(conn, 'UPDATE customers SET')!;
    expect(sql).toMatch(/email = NULL/);
    expect(sql).toMatch(/phone_number = NULL/);
    expect(sql).toMatch(/phone = NULL/);
    expect(sql).toMatch(/address = NULL/);
    expect(sql).not.toMatch(/deleted_at/);
    const [identifier, firstName, lastName, passwordHash, id] = params as unknown[];
    expect([identifier, firstName, lastName, id]).toEqual(['deleted:7', 'Deleted', 'User', 7]);
    expect(passwordHash).toMatch(/^\$2[aby]\$/); // unusable but well-formed bcrypt hash
  });

  it('removes personal data held elsewhere but keeps favorites, orders and ratings', async () => {
    const conn = makeConn();
    getConnection.mockResolvedValue(conn);
    await new AccountDeletionMysqlRepository().anonymizeCustomer(7);

    const sql = sqlOf(conn);
    expect(sql).toContain('DELETE FROM cart_items WHERE cart_id = ?');
    expect(sql).toContain('DELETE FROM carts WHERE customer_id = ?');
    expect(sql).toContain('DELETE FROM notify_requests WHERE customer_id = ?');
    expect(sql).toContain('UPDATE product_reviews SET comment = NULL WHERE customer_id = ?');
    expect(sql).toContain('UPDATE item_requests SET notes = NULL WHERE customer_id = ?');
    expect(sql.some((s) => /DELETE FROM auth_tokens WHERE user_type = 'customer' AND user_id = \?/.test(s))).toBe(true);
    expect(sql.some((s) => s.includes('favorites'))).toBe(false);
    expect(sql.some((s) => /DELETE FROM (orders|order_items)/.test(s))).toBe(false);
  });

  it('releases stock held by the cart and by unpaid pending orders before expiring them', async () => {
    const conn = makeConn();
    getConnection.mockResolvedValue(conn);
    await new AccountDeletionMysqlRepository().anonymizeCustomer(7);

    const sql = sqlOf(conn);
    const cartRelease = sql.findIndex((s) => s.includes('UPDATE product_stock') && s.includes('FROM cart_items'));
    const orderRelease = sql.findIndex((s) => s.includes('UPDATE product_stock') && s.includes('FROM order_items'));
    const expire = sql.findIndex((s) => /UPDATE orders .*status = 'expired'/s.test(s));
    expect(cartRelease).toBeGreaterThanOrEqual(0);
    expect(orderRelease).toBeGreaterThanOrEqual(0);
    expect(expire).toBeGreaterThan(orderRelease);
    expect(sql.findIndex((s) => s.includes('DELETE FROM cart_items'))).toBeGreaterThan(cartRelease);
  });

  it('runs every statement inside one transaction and commits once', async () => {
    const conn = makeConn();
    getConnection.mockResolvedValue(conn);
    await new AccountDeletionMysqlRepository().anonymizeCustomer(7);

    expect(conn.beginTransaction.mock.invocationCallOrder[0]).toBeLessThan(conn.query.mock.invocationCallOrder[0]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    const queryOrder = conn.query.mock.invocationCallOrder;
    expect(conn.commit.mock.invocationCallOrder[0]).toBeGreaterThan(queryOrder[queryOrder.length - 1]);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the connection when any statement fails', async () => {
    const conn = makeConn();
    conn.query.mockImplementation(async (sql: string, _params?: unknown[]) => {
      if (/FROM customers WHERE id = \? FOR UPDATE/.test(sql)) return [[{ id: 7, identifier: 'a@b.co' }], undefined];
      if (sql.includes('notify_requests')) throw new Error('boom');
      return [{ affectedRows: 1 }, undefined];
    });
    getConnection.mockResolvedValue(conn);

    await expect(new AccountDeletionMysqlRepository().anonymizeCustomer(7)).rejects.toThrow('boom');
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it('does nothing and reports false when the customer is already anonymized', async () => {
    const conn = makeConn({ id: 7, identifier: 'deleted:7' });
    getConnection.mockResolvedValue(conn);

    expect(await new AccountDeletionMysqlRepository().anonymizeCustomer(7)).toBe(false);
    expect(sqlOf(conn).filter((s) => /^(UPDATE|DELETE)/.test(s))).toEqual([]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it('reports false when the customer does not exist', async () => {
    const conn = makeConn(null);
    getConnection.mockResolvedValue(conn);
    expect(await new AccountDeletionMysqlRepository().anonymizeCustomer(7)).toBe(false);
    expect(sqlOf(conn).filter((s) => /^(UPDATE|DELETE)/.test(s))).toEqual([]);
  });
});
