import { StripeClient } from '../../infrastructure/stripe/StripeClient';
import { OrderMysqlRepository } from '../../infrastructure/repositories/OrderMysqlRepository';
import { TransactionMysqlRepository } from '../../infrastructure/repositories/TransactionMysqlRepository';
import { PaymentAttemptMysqlRepository } from '../../infrastructure/repositories/PaymentAttemptMysqlRepository';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';
import { IPaymentAttemptRepository } from '../../domain/repositories/IPaymentAttemptRepository';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors/AppError';

export class PaymentService {
  constructor(
    private orders: IOrderRepository = new OrderMysqlRepository(),
    private transactions: ITransactionRepository = new TransactionMysqlRepository(),
    private attempts: IPaymentAttemptRepository = new PaymentAttemptMysqlRepository(),
    private stripe: StripeClient = new StripeClient(),
  ) {}

  async createIntent(orderId: number, amountNzd: number) {
    return this.stripe.createPaymentIntent(orderId, amountNzd);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const { orderId } = await this.stripe.verifyWebhook(rawBody, signature);
    if (!orderId) return;
    const order = await this.orders.findById(orderId);
    if (!order || order.status === 'expired') return;
    await this.recordSuccess(order, order.stripe_payment_intent_id!);
  }

  async confirmPayment(orderId: number, customerId: number): Promise<{ payment_status: string }> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customer_id !== customerId) throw new ForbiddenError();
    if (order.status === 'expired') throw new ValidationError('Order expired, please reorder');
    if (order.payment_status === 'paid') return { payment_status: 'paid' };
    if (!order.stripe_payment_intent_id) return { payment_status: order.payment_status };

    const intent = await this.stripe.retrievePaymentIntent(order.stripe_payment_intent_id);
    if (intent.status === 'succeeded') {
      await this.attempts.create({ order_id: orderId, stripe_payment_intent_id: order.stripe_payment_intent_id, status: 'succeeded', error_message: null, attempted_at: new Date() });
      return this.recordSuccess(order, order.stripe_payment_intent_id);
    }

    await this.attempts.create({ order_id: orderId, stripe_payment_intent_id: order.stripe_payment_intent_id, status: intent.status, error_message: null, attempted_at: new Date() });
    return { payment_status: order.payment_status };
  }

  private async recordSuccess(order: { id: number; total_nzd: number; payment_status: string }, providerRef: string): Promise<{ payment_status: string }> {
    const existing = await this.transactions.findByProviderRef(providerRef);
    if (!existing) {
      const { method } = await this.stripe.resolvePaymentMethod(providerRef);
      await this.transactions.create({
        order_id: order.id,
        payment_channel: 'stripe',
        payment_method: method,
        status: 'succeeded',
        amount_nzd: order.total_nzd,
        provider_ref: providerRef,
      });
    }

    const paidSoFar = await this.transactions.sumSucceededByOrder(order.id);
    const newStatus = paidSoFar >= order.total_nzd ? 'paid' : paidSoFar > 0 ? 'partially_paid' : 'unpaid';
    await this.orders.updatePaymentStatus(order.id, newStatus);
    return { payment_status: newStatus };
  }
}
