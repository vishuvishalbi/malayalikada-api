import { IBanner } from '../entities/Banner';

export interface IBannerRepository {
  findAllActive(): Promise<IBanner[]>;
  findById(id: number): Promise<IBanner | null>;
  create(data: Omit<IBanner, 'id' | 'created_at' | 'updated_at'>): Promise<IBanner>;
  update(id: number, data: Partial<Omit<IBanner, 'id' | 'created_at' | 'updated_at'>>): Promise<IBanner | null>;
  deactivate(id: number): Promise<void>;
}
