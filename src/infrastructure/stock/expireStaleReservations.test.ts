import { describe, it, expect, vi } from 'vitest';
import { expireStaleReservations } from './expireStaleReservations';

function makeConn(queryResults: any[]) {
  const query = vi.fn();
  queryResults.forEach((r, i) => query.mockResolvedValueOnce([r, undefined]));
  return { query } as any;
}

describe('expireStaleReservations', () => {
  it('expires stale cart_items and decrements reserved_quantity', async () => {
    const conn = makeConn([
      [{ id: 1, quantity: 3 }],   // stale cart_items select
      { affectedRows: 1 },         // reserved_quantity decrement
      { affectedRows: 1 },         // cart_items delete
      [],                          // stale order_items select
    ]);
    await expireStaleReservations(conn, 42, 7);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, quantity FROM cart_items'),
      expect.arrayContaining([42, 7])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE product_stock SET reserved_quantity = GREATEST(0, reserved_quantity - ?)'),
      [3, 42, 7]
    );
  });

  it('expires stale unpaid order_items and marks the order expired', async () => {
    const conn = makeConn([
      [],                                                  // no stale cart_items
      [{ id: 5, order_id: 900, quantity: 2 }],              // stale order_items select
      { affectedRows: 1 },                                  // reserved_quantity decrement
      { affectedRows: 1 },                                  // orders status update
    ]);
    await expireStaleReservations(conn, 42, 7);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE orders SET status = 'expired'"),
      [900]
    );
  });

  it('only selects order_items from pending_approval, unpaid orders', async () => {
    const conn = makeConn([[], []]);
    await expireStaleReservations(conn, 42, 7);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringMatching(/status = 'pending_approval' AND o\.payment_status = 'unpaid'/),
      [42, 7]
    );
  });
});
