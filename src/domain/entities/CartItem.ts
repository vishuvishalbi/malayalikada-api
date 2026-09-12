export interface ICartItem {
  id: number;
  cart_id: number;
  product_id: number;
  store_id: number;
  quantity: number;
  /** NULL when the stock hold has lapsed; the line is re-reserved on the next cart read. */
  reserved_at: Date | null;
}
