import { IProduct, IProductImage } from '../entities/Product';

export interface ProductListFilters {
  category_id?: number;
  search?: string;
  store_id?: number;
  featured?: boolean;
  sort?: 'newest';
  page: number;
  limit: number;
}

export interface IProductStoreData {
  price: number | null;
  stock_quantity: number;
  in_stock: boolean;
}

export interface IProductRepository {
  findAll(filters: ProductListFilters): Promise<{ products: IProduct[]; total: number }>;
  findById(id: number): Promise<IProduct | null>;
  findByBarcode(barcode: string): Promise<IProduct | null>;
  findStoreData(productId: number, storeId: number): Promise<IProductStoreData>;
  findRelated(categoryId: number, excludeId: number, storeId?: number, limit?: number): Promise<IProduct[]>;
  create(data: Omit<IProduct, 'id' | 'deleted_at' | 'created_at' | 'updated_at' | 'first_image_url'>): Promise<IProduct>;
  update(id: number, data: Partial<Omit<IProduct, 'id' | 'created_at' | 'updated_at'>>): Promise<IProduct | null>;
  softDelete(id: number): Promise<void>;
  addImage(productId: number, filename: string, sortOrder: number): Promise<IProductImage>;
  removeImage(productId: number, imageId: number): Promise<void>;
  getImageCount(productId: number): Promise<number>;
  getImages(productId: number): Promise<IProductImage[]>;
}
