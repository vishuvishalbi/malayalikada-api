import { IItemRequest } from '../entities/ItemRequest';

export interface IItemRequestRepository {
  create(data: Omit<IItemRequest, 'id' | 'created_at' | 'updated_at'>): Promise<IItemRequest>;
  findByCustomer(customerId: number): Promise<IItemRequest[]>;
  findAllAdmin(storeId?: number, status?: IItemRequest['status']): Promise<(IItemRequest & { customer_name: string | null })[]>;
  updateStatus(id: number, status: IItemRequest['status'], adminNotes?: string): Promise<IItemRequest>;
}
