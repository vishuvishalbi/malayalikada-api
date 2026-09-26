import { IProduct, IProductImage } from '../entities/Product';

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';

export interface ProductListFilters {
  /** Matches products in ANY of these categories. */
  category_ids?: number[];
  /** Matches products of ANY of these brands. */
  brand_ids?: number[];
  search?: string;
  /** Only products with stock at store_id (ignored without store_id). */
  in_stock?: boolean;
  store_id?: number;
  featured?: boolean;
  /** Inclusive bounds on store_pricing.price_nzd (ignored without store_id). */
  min_price?: number;
  max_price?: number;
  /** Price sorts require store_id; they fall back to name_asc without one. */
  sort?: ProductSort;
  include_inactive?: boolean;
  page: number;
  limit: number;
}

export interface IProductStoreData {
  price: number | null;
  stock_quantity: number;
  in_stock: boolean;
}

/** One flattened catalog row for the admin CSV export. */
export interface IProductExportRow {
  barcode: string;
  name: string;
  category_id: number;
  primary_category: string | null;
  /** All category names for the product. */
  categories: string[];
  brand: string | null;
  unit: string | null;
  weight: number | null;
  supplier: string | null;
  description: string | null;
  is_active: boolean;
  is_featured: boolean;
  /** Store price; null when no store was requested or no pricing row exists. */
  price_nzd: number | null;
  cost_nzd: number | null;
  /** Store stock; null when no store was requested. */
  stock_quantity: number | null;
  /** Image filenames, ordered; the service maps them to public URLs. */
  image_filenames: string[];
}

export interface IProductRepository {
  findAll(filters: ProductListFilters): Promise<{ products: IProduct[]; total: number }>;
  findById(id: number): Promise<IProduct | null>;
  findByBarcode(barcode: string): Promise<IProduct | null>;
  findStoreData(productId: number, storeId: number): Promise<IProductStoreData>;
  isFavorited(productId: number, customerId: number): Promise<boolean>;
  isNotifyRequested(productId: number, customerId: number, storeId: number): Promise<boolean>;
  findRelated(categoryId: number, excludeId: number, storeId?: number, limit?: number): Promise<IProduct[]>;
  findTrending(storeId?: number, limit?: number): Promise<IProduct[]>;
  create(data: Omit<IProduct, 'id' | 'deleted_at' | 'created_at' | 'updated_at' | 'first_image_url'>): Promise<IProduct>;
  /** `category_ids` (if given) replaces the full category set; `brand` name is resolved to a brand entity. */
  update(id: number, data: Partial<Omit<IProduct, 'id' | 'created_at' | 'updated_at'>>): Promise<IProduct | null>;
  softDelete(id: number): Promise<void>;
  addImage(productId: number, filename: string, sortOrder: number): Promise<IProductImage>;
  removeImage(productId: number, imageId: number): Promise<void>;
  getImageCount(productId: number): Promise<number>;
  getImages(productId: number): Promise<IProductImage[]>;
  findFavoritedIds(customerId: number, productIds: number[]): Promise<number[]>;
  findBrands(): Promise<string[]>;
  /**
   * Full non-deleted catalog (active and inactive) for CSV export, resolved in
   * a fixed number of bulk queries — never per-product.
   */
  findAllForExport(storeId?: number): Promise<IProductExportRow[]>;
}
