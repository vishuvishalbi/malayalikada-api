import { IDeliverySlab } from '../entities/DeliverySlab';

export interface IDeliverySlabRepository {
  findAll(): Promise<IDeliverySlab[]>;
  findActive(): Promise<IDeliverySlab[]>;
  findById(id: number): Promise<IDeliverySlab | null>;
  create(data: Omit<IDeliverySlab, 'id' | 'created_at' | 'updated_at'>): Promise<IDeliverySlab>;
  update(id: number, data: Partial<Omit<IDeliverySlab, 'id' | 'created_at' | 'updated_at'>>): Promise<IDeliverySlab | null>;
  delete(id: number): Promise<void>;
}
