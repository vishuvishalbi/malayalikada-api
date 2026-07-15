export type PaymentChannel = 'stripe' | 'cash';
export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'cash';
export type TransactionStatus = 'succeeded' | 'refunded';

export interface ITransaction {
  id: number;
  order_id: number;
  payment_channel: PaymentChannel;
  payment_method: PaymentMethod;
  status: TransactionStatus;
  amount_nzd: number;
  provider_ref: string | null;
  created_at: Date;
}
