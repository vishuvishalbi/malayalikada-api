import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/connection', () => ({
  db: { query: vi.fn().mockResolvedValue([[], undefined]) },
}));

import { OrderService } from './OrderService';

function makeOrdersRepo() {
  return {
    createWithReservation: vi.fn().mockResolvedValue({ id: 55, total_nzd: 20 }),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    deductStock: vi.fn(),
    releaseReservation: vi.fn(),
    setPaymentIntent: vi.fn(),
  } as any;
}
function makeCartsRepo(items: any[]) {
  return {
    findByCustomer: vi.fn().mockResolvedValue({ customer_id: 1, store_id: 5 }),
    findItems: vi.fn().mockResolvedValue(items),
  } as any;
}
function makeDelivery() {
  return { feeForWeight: vi.fn().mockResolvedValue(5) } as any;
}
function makePayments() {
  return { createIntent: vi.fn().mockResolvedValue({ clientSecret: 'cs_1', paymentIntentId: 'pi_1' }) } as any;
}

describe('OrderService.submit', () => {
  it('throws when cart has no items', async () => {
    const service = new OrderService(makeOrdersRepo(), makeCartsRepo([]), makeDelivery(), makePayments());
    await expect(service.submit(1)).rejects.toThrow('Cart is empty');
  });
});
