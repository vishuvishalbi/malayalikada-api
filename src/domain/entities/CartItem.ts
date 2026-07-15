export interface ICartItem {
  id: number;
  cart_id: number;
  product_id: number;
  store_id: number;
  quantity: number;
  reserved_at: Date;
}
