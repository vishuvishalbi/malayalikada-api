export interface IItemRequest {
  id: number;
  customer_id: number;
  store_id: number;
  product_name: string;
  barcode: string | null;
  notes: string | null;
  status: 'new' | 'sourced' | 'declined';
  admin_notes: string | null;
  created_at: Date;
  updated_at: Date;
}
