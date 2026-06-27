import { IStore } from '../entities/Store';

export interface IStoreRepository {
  findAll(): Promise<IStore[]>;
  findById(id: number): Promise<IStore | null>;
  create(data: Omit<IStore, 'id' | 'created_at' | 'updated_at'>): Promise<IStore>;
  update(id: number, data: Partial<Omit<IStore, 'id' | 'created_at' | 'updated_at'>>): Promise<IStore | null>;
  deactivate(id: number): Promise<void>;
}
