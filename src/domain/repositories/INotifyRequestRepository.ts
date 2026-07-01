import { INotifyRequest } from '../entities/NotifyRequest';

export interface INotifyRequestRepository {
  upsert(data: Pick<INotifyRequest, 'customer_id' | 'product_id' | 'store_id'>): Promise<INotifyRequest>;
}
