export class StripeClient {
  private stubMode = !process.env.STRIPE_SECRET_KEY;

  async createPaymentIntent(orderId: number, amountNzd: number): Promise<{ clientSecret: string; paymentIntentId: string }> {
    if (this.stubMode) {
      return {
        clientSecret: `stub_secret_${orderId}`,
        paymentIntentId: `pi_stub_${orderId}`,
      };
    }
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountNzd * 100),
      currency: 'nzd',
      metadata: { order_id: String(orderId) },
    });
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }

  async verifyWebhook(rawBody: Buffer, signature: string): Promise<{ orderId: number }> {
    if (this.stubMode) return { orderId: 0 };
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    const intent = event.data.object as any;
    return { orderId: Number(intent.metadata.order_id) };
  }
}
