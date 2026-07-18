import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../infrastructure/database/connection', () => ({
  db: { query: (...args: any[]) => query(...args) },
}));

import { AdminService } from './AdminService';

function svc() {
  return new AdminService({} as any, {} as any);
}

describe('AdminService.analytics', () => {
  beforeEach(() => query.mockReset());

  it('aggregates totals, daily series, and top products', async () => {
    // Order of internal queries: totals, daily, topProducts.
    query
      .mockResolvedValueOnce([[{ totalRevenueNzd: '300.00', orderCount: 10 }]])
      .mockResolvedValueOnce([[
        { date: '2026-07-01', revenueNzd: '120.00', orderCount: 4 },
        { date: '2026-07-02', revenueNzd: '180.00', orderCount: 6 },
      ]])
      .mockResolvedValueOnce([[
        { productId: 7, name: 'Basmati Rice 5kg', unitsSold: 30, revenueNzd: '450.00' },
      ]]);

    const result = await svc().analytics({ from: '2026-07-01', to: '2026-07-02' });

    expect(result.totalRevenueNzd).toBe(300);
    expect(result.orderCount).toBe(10);
    expect(result.avgOrderValueNzd).toBe(30);
    expect(result.daily).toHaveLength(2);
    expect(result.daily[0]).toEqual({ date: '2026-07-01', revenueNzd: 120, orderCount: 4 });
    expect(result.topProducts[0].unitsSold).toBe(30);
    expect(result.topProducts[0].revenueNzd).toBe(450);
  });

  it('returns zeros for an empty period without dividing by zero', async () => {
    query
      .mockResolvedValueOnce([[{ totalRevenueNzd: null, orderCount: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    const result = await svc().analytics({ from: '2026-07-01', to: '2026-07-02' });
    expect(result.totalRevenueNzd).toBe(0);
    expect(result.avgOrderValueNzd).toBe(0);
    expect(result.daily).toEqual([]);
    expect(result.topProducts).toEqual([]);
  });
});
