import { INotifyRequestRepository } from '../../domain/repositories/INotifyRequestRepository';

export class NotifyRequestService {
  constructor(private repo: INotifyRequestRepository) {}

  async create(customerId: number, productId: number, storeId: number) {
    return this.repo.upsert({ customer_id: customerId, product_id: productId, store_id: storeId });
  }
}
