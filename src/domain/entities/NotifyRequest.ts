export interface INotifyRequest {
  id: number;
  customer_id: number;
  product_id: number;
  store_id: number;
  created_at: Date;
  notified_at: Date | null;
}
