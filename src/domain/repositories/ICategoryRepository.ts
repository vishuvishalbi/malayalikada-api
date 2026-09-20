import { ICategory } from '../entities/Category';

export interface ICategoryRepository {
  findAll(): Promise<ICategory[]>;
  findById(id: number): Promise<ICategory | null>;
  /** `product_count` is derived from the catalogue, never supplied by callers. */
  create(data: Omit<ICategory, 'id' | 'deleted_at' | 'created_at' | 'updated_at' | 'product_count'>): Promise<ICategory>;
  update(id: number, data: Partial<Omit<ICategory, 'id' | 'created_at' | 'updated_at' | 'product_count'>>): Promise<ICategory | null>;
  softDelete(id: number): Promise<void>;
}
