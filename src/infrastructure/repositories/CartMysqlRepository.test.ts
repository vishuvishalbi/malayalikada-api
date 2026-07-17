import { describe, it, expect, vi } from 'vitest';

const getConnection = vi.fn();
vi.mock('../database/connection', () => ({
  db: { query: vi.fn(), getConnection: (...args: any[]) => getConnection(...args) },
}));

import { CartMysqlRepository } from './CartMysqlRepository';

function makeConn(responses: any[]) {
  const query = vi.fn();
  responses.forEach(r => query.mockResolvedValueOnce([r, undefined]));
  return {
    query,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
}

describe('CartMysqlRepository.reserveItem', () => {
  it('rejects a product that has stock tracked but no store_pricing row', async () => {
    const conn = makeConn([
      undefined,                        // INSERT INTO carts
      undefined,                        // SELECT product_stock ... FOR UPDATE
      [],                                // expireStaleReservations: stale cart_items select
      [],                                // expireStaleReservations: stale order_items select
      [{ quantity: 10, reserved_quantity: 0, max_reserve_qty: 10 }], // SELECT product_stock (fresh read)
      [],                                // SELECT store_pricing -> empty, no price row
    ]);
    getConnection.mockResolvedValue(conn);

    const repo = new CartMysqlRepository();
    await expect(repo.reserveItem(1, 5, 42, 2)).rejects.toThrow('Product not available at selected store');

    expect(conn.query).toHaveBeenCalledWith(
      'SELECT price_nzd FROM store_pricing WHERE product_id = ? AND store_id = ?',
      [42, 5]
    );
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('succeeds when both product_stock and store_pricing rows exist', async () => {
    const conn = makeConn([
      undefined,                        // INSERT INTO carts
      undefined,                        // SELECT product_stock ... FOR UPDATE
      [],                                // expireStaleReservations: stale cart_items select
      [],                                // expireStaleReservations: stale order_items select
      [{ quantity: 10, reserved_quantity: 0, max_reserve_qty: 10 }], // SELECT product_stock (fresh read)
      [{ price_nzd: '4.99' }],           // SELECT store_pricing -> price exists
      [],                                // SELECT existing cart_items row -> none
      undefined,                         // INSERT cart_items
      undefined,                         // UPDATE product_stock reserved_quantity
    ]);
    getConnection.mockResolvedValue(conn);
    const dbModule = await import('../database/connection');
    (dbModule.db.query as any).mockResolvedValue([[{ id: 1, cart_id: 1, product_id: 42, store_id: 5, quantity: 2 }], undefined]);

    const repo = new CartMysqlRepository();
    await repo.reserveItem(1, 5, 42, 2);

    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });
});
