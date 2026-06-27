export interface IProduct {
  id: number;
  barcode: string;
  name: string;
  description: string | null;
  category_id: number;
  brand: string | null;
  unit: string | null;
  weight: number | null;
  supplier: string | null;
  is_active: boolean;
  is_featured: boolean;
  first_image_url: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IProductImage {
  id: number;
  product_id: number;
  filename: string;
  sort_order: number;
}

export interface IProductStock {
  product_id: number;
  store_id: number;
  quantity: number;
  low_stock_threshold: number;
}

export interface IStorePricing {
  product_id: number;
  store_id: number;
  price_nzd: number;
  effective_date: string;
}
