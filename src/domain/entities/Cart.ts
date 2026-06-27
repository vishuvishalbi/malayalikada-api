export interface ICartItem {
  product_id: number;
  quantity: number;
}

export interface ICart {
  customer_id: number;
  store_id: number;
  items: ICartItem[];
  updated_at: Date;
}
