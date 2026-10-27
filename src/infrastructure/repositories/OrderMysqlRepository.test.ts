import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../database/connection', () => ({
  db: { query: (...args: any[]) => query(...args) },
}));

import { OrderMysqlRepository, ORDER_ITEM_COLUMNS } from './OrderMysqlRepository';

const itemSql = () =>
  query.mock.calls.map(c => String(c[0])).filter(sql => sql.includes('FROM order_items oi'));

describe('order item response columns', () => {
  beforeEach(() => query.mockReset());

  it('lists exactly the fields clients use', () => {
    expect(ORDER_ITEM_COLUMNS.split(', ')).toEqual(['oi.id', 'oi.order_id', 'oi.product_id', 'oi.quantity', 'oi.unit_price_nzd']);
  });

  it.each([
    ['findById', (r: OrderMysqlRepository) => r.findById(1), [[{ id: 1 }]]],
    ['findAdminDetail', (r: OrderMysqlRepository) => r.findAdminDetail(1), [[{ id: 1 }]]],
    ['findWorkerQueue', (r: OrderMysqlRepository) => r.findWorkerQueue([1]), [[{ id: 1 }]]],
  ])('%s selects order items by explicit columns', async (_n, call, firstResult) => {
    query.mockResolvedValueOnce(firstResult).mockResolvedValue([[]]);
    await call(new OrderMysqlRepository());
    const sqls = itemSql();
    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toContain(ORDER_ITEM_COLUMNS);
    expect(sqls[0]).not.toMatch(/oi\.\*|unit_cost_nzd/);
  });
});
