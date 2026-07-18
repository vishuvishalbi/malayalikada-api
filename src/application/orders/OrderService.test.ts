import { describe, it, expect, vi } from 'vitest';

const dbQuery = vi.fn();
vi.mock('../../infrastructure/database/connection', () => ({
  db: { query: (...args: any[]) => dbQuery(...args) },
}));

import { OrderService } from './OrderService';

function makeOrdersRepo(overrides: Partial<any> = {}) {
  return {
    createWithReservation: vi.fn().mockResolvedValue({ id: 55, total_nzd: 20 }),
    findById: vi.fn().mockResolvedValue({ id: 55, status: 'pending_approval', store_id: 5 }),
    updateStatus: vi.fn(),
    deductStock: vi.fn(),
    approveWithStock: vi.fn(),
    releaseReservation: vi.fn(),
    setPaymentIntent: vi.fn(),
    ...overrides,
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
    dbQuery.mockResolvedValue([[], undefined]);
    const service = new OrderService(makeOrdersRepo(), makeCartsRepo([]), makeDelivery(), makePayments());
    await expect(service.submit(1)).rejects.toThrow('Cart is empty');
  });

  it('calls createWithReservation with correctly-priced order items and the customer id', async () => {
    dbQuery.mockResolvedValue([[{ product_id: 9, price_nzd: '4.99', weight: '0.2' }], undefined]);
    const orders = makeOrdersRepo();
    const cartItems = [{ id: 1, cart_id: 1, product_id: 9, store_id: 5, quantity: 3, reserved_at: new Date() }];
    const service = new OrderService(orders, makeCartsRepo(cartItems), makeDelivery(), makePayments());

    await service.submit(1);

    expect(orders.createWithReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 1,
        store_id: 5,
        status: 'pending_approval',
        payment_status: 'unpaid',
        total_nzd: expect.any(Number),
      }),
      [{ product_id: 9, quantity: 3, unit_price_nzd: 4.99 }],
      1
    );
  });
});

describe('OrderService.reject', () => {
  it('releases the reservation before updating the order status', async () => {
    const callOrder: string[] = [];
    const orders = makeOrdersRepo({
      releaseReservation: vi.fn().mockImplementation(async () => { callOrder.push('releaseReservation'); }),
      updateStatus: vi.fn().mockImplementation(async () => { callOrder.push('updateStatus'); }),
    });
    const service = new OrderService(orders, makeCartsRepo([]), makeDelivery(), makePayments());

    await service.reject(55, 1, 'out of stock', 'admin', []);

    expect(orders.releaseReservation).toHaveBeenCalledWith(55);
    expect(orders.updateStatus).toHaveBeenCalledWith(55, 'rejected', 1, 'out of stock');
    expect(callOrder).toEqual(['releaseReservation', 'updateStatus']);
  });
});
