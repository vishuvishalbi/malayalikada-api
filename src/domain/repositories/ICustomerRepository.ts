import { ICustomer } from '../entities/Customer';

export interface ICustomerRepository {
  findByIdentifier(identifier: string): Promise<ICustomer | null>;
  findByEmail(email: string): Promise<ICustomer | null>;
  findByPhone(phone: string): Promise<ICustomer | null>;
  findById(id: number): Promise<ICustomer | null>;
  findAll(search?: string, offset?: number, limit?: number): Promise<{ items: ICustomer[]; total: number }>;
  create(data: Omit<ICustomer, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>): Promise<ICustomer>;
  update(id: number, data: Partial<Omit<ICustomer, 'id' | 'created_at' | 'updated_at'>>): Promise<ICustomer | null>;
  softDelete(id: number): Promise<void>;
}
