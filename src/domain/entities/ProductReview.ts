export interface IProductReview {
  id: number;
  product_id: number;
  customer_id: number;
  rating: number;
  comment: string | null;
  created_at: Date;
  customer_name?: string;
}
