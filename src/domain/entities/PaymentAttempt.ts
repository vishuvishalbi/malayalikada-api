export interface IPaymentAttempt {
  id: number;
  order_id: number;
  stripe_payment_intent_id: string | null;
  status: string;
  error_message: string | null;
  attempted_at: Date;
}
