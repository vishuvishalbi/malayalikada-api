import { StripeClient } from '../../infrastructure/stripe/StripeClient';
import { db } from '../../infrastructure/database/connection';

export class PaymentService {
  private stripe = new StripeClient();

  async createIntent(orderId: number, amountNzd: number) {
    return this.stripe.createPaymentIntent(orderId, amountNzd);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const { orderId } = await this.stripe.verifyWebhook(rawBody, signature);
    if (orderId) {
      await db.query(
        "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = ?",
        [orderId]
      );
    }
  }
}
