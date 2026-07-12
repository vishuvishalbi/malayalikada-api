import { StripeClient } from '../../infrastructure/stripe/StripeClient';
import { OrderMysqlRepository } from '../../infrastructure/repositories/OrderMysqlRepository';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { NotFoundError, ForbiddenError } from '../../shared/errors/AppError';

export class PaymentService {
  private stripe = new StripeClient();

  constructor(private orders: IOrderRepository = new OrderMysqlRepository()) {}

  async createIntent(orderId: number, amountNzd: number) {
    return this.stripe.createPaymentIntent(orderId, amountNzd);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const { orderId } = await this.stripe.verifyWebhook(rawBody, signature);
    if (orderId) {
      await this.orders.markPaid(orderId);
    }
  }

  async confirmPayment(orderId: number, customerId: number): Promise<{ payment_status: string }> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customer_id !== customerId) throw new ForbiddenError();
    if (order.payment_status === 'paid') return { payment_status: 'paid' };
    if (!order.stripe_payment_intent_id) return { payment_status: order.payment_status };

    const intent = await this.stripe.retrievePaymentIntent(order.stripe_payment_intent_id);
    if (intent.status === 'succeeded') {
      await this.orders.markPaid(orderId);
      return { payment_status: 'paid' };
    }
    return { payment_status: order.payment_status };
  }
}
