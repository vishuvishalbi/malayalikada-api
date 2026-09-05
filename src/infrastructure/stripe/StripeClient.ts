export class StripeClient {
  private stubMode = !process.env.STRIPE_SECRET_KEY;

  constructor() {
    if (this.stubMode && process.env.NODE_ENV === 'production') {
      throw new Error('STRIPE_SECRET_KEY is required in production — refusing to start in payment stub mode.');
    }
    if (!this.stubMode && !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set — webhook signature verification cannot run without it.');
    }
  }

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

  async verifyWebhook(rawBody: Buffer, signature: string): Promise<{ orderId: number; outcome: 'succeeded' | 'refunded' | 'failed' | 'ignored' }> {
    if (this.stubMode) return { orderId: 0, outcome: 'ignored' };
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as any;
        return { orderId: Number(intent.metadata.order_id), outcome: 'succeeded' };
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as any;
        return { orderId: Number(intent.metadata.order_id), outcome: 'failed' };
      }
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const charge = event.data.object as any;
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (!intentId) return { orderId: 0, outcome: 'ignored' };
        const intent = await stripe.paymentIntents.retrieve(intentId);
        return { orderId: Number(intent.metadata.order_id), outcome: 'refunded' };
      }
      default:
        return { orderId: 0, outcome: 'ignored' };
    }
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<{ status: string }> {
    if (this.stubMode) return { status: 'succeeded' };
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return { status: intent.status };
  }

  async resolvePaymentMethod(paymentIntentId: string): Promise<{ method: 'card' | 'apple_pay' | 'google_pay'; amount_nzd: number }> {
    if (this.stubMode) return { method: 'card', amount_nzd: 0 };
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = intent.latest_charge as any;
    const details = charge?.payment_method_details;
    const walletType = details?.card?.wallet?.type;
    let method: 'card' | 'apple_pay' | 'google_pay' = 'card';
    if (walletType === 'apple_pay') method = 'apple_pay';
    else if (walletType === 'google_pay') method = 'google_pay';
    return { method, amount_nzd: intent.amount / 100 };
  }
}
