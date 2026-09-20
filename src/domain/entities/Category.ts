export interface ICategory {
  id: number;
  name: string;
  icon: string | null;
  image_filename: string | null;
  parent_id: number | null;
  sort_order: number;
  /** Denormalized count of live, active products in this category alone. */
  product_count: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ICategoryTree extends ICategory {
  children: ICategoryTree[];
  /** Own `product_count` plus every descendant's — what the UI badge shows. */
  total_product_count: number;
}
