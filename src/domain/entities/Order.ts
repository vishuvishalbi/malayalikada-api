export interface IOrder {
  id: number;
  reference_no: string;
  customer_id: number;
  store_id: number;
  status: 'pending_approval' | 'approved' | 'rejected';
  total_nzd: number;
  delivery_fee_nzd: number;
  total_weight_kg: number;
  stripe_payment_intent_id: string | null;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  rejection_reason: string | null;
  actioned_by: number | null;
  actioned_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price_nzd: number;
}
