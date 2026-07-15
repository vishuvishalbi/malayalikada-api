import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/connection', () => ({
  db: { query: vi.fn().mockResolvedValue([[], undefined]) },
}));

import { PaymentService } from './PaymentService';

function makeStripe(overrides: Partial<any> = {}) {
  return {
    createPaymentIntent: vi.fn(),
    verifyWebhook: vi.fn(),
    retrievePaymentIntent: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    resolvePaymentMethod: vi.fn().mockResolvedValue({ method: 'card', amount_nzd: 20 }),
    ...overrides,
  };
}
function makeOrders(order: any) {
  return {
    findById: vi.fn().mockResolvedValue(order),
    updatePaymentStatus: vi.fn(),
  } as any;
}
function makeTransactions(existing: any = null) {
  return {
    findByProviderRef: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue({}),
    sumSucceededByOrder: vi.fn().mockResolvedValue(20),
  } as any;
}
function makeAttempts() {
  return { create: vi.fn() } as any;
}

describe('PaymentService.confirmPayment', () => {
  it('rejects a call for an expired order without hitting Stripe', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'expired', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 20 };
    const service = new PaymentService(makeOrders(order), makeTransactions(), makeAttempts(), stripe as any);
    await expect(service.confirmPayment(1, 1)).rejects.toThrow(/expired/i);
    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it('writes a transaction and marks paid when total is fully covered', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'pending_approval', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 20 };
    const orders = makeOrders(order);
    const transactions = makeTransactions();
    const service = new PaymentService(orders, transactions, makeAttempts(), stripe as any);
    const result = await service.confirmPayment(1, 1);
    expect(transactions.create).toHaveBeenCalledWith(expect.objectContaining({ order_id: 1, payment_channel: 'stripe', payment_method: 'card', status: 'succeeded' }));
    expect(orders.updatePaymentStatus).toHaveBeenCalledWith(1, 'paid');
    expect(result.payment_status).toBe('paid');
  });

  it('does not double-insert a transaction for the same provider_ref', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'pending_approval', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 20 };
    const orders = makeOrders(order);
    const transactions = makeTransactions({ id: 1, provider_ref: 'pi_1' });
    const service = new PaymentService(orders, transactions, makeAttempts(), stripe as any);
    await service.confirmPayment(1, 1);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('marks the order partially_paid when the succeeded total is less than the order total', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'pending_approval', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 100 };
    const orders = makeOrders(order);
    const transactions = makeTransactions();
    transactions.sumSucceededByOrder = vi.fn().mockResolvedValue(70); // e.g. an earlier $40 + this $30 payment
    const service = new PaymentService(orders, transactions, makeAttempts(), stripe as any);

    const result = await service.confirmPayment(1, 1);

    expect(orders.updatePaymentStatus).toHaveBeenCalledWith(1, 'partially_paid');
    expect(result.payment_status).toBe('partially_paid');
  });
});
