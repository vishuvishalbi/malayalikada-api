import { IBrand } from '../entities/Brand';

export interface IBrandRepository {
  findAll(): Promise<IBrand[]>;
  findById(id: number): Promise<IBrand | null>;
  findByName(name: string): Promise<IBrand | null>;
  /** Returns the id of the brand with this name, creating it if needed. */
  findOrCreateByName(name: string): Promise<number>;
  create(data: { name: string }): Promise<IBrand>;
  update(id: number, data: Partial<{ name: string; logo_filename: string | null }>): Promise<IBrand | null>;
  countProducts(id: number): Promise<number>;
  softDelete(id: number): Promise<void>;
}
