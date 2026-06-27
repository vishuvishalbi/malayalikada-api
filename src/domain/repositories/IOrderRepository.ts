import { IOrder, IOrderItem } from '../entities/Order';

export interface OrderListFilters {
  storeId?: number;
  status?: IOrder['status'];
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface IOrderRepository {
  create(order: Omit<IOrder, 'id' | 'created_at' | 'updated_at'>, items: Omit<IOrderItem, 'id'>[]): Promise<IOrder>;
  findByCustomer(customerId: number, offset: number, limit: number): Promise<{ items: IOrder[]; total: number }>;
  findById(id: number): Promise<(IOrder & { orderItems: IOrderItem[] }) | null>;
  findWorkerQueue(storeIds: number[]): Promise<IOrder[]>;
  findAllAdmin(filters: OrderListFilters): Promise<{ items: IOrder[]; total: number }>;
  updateStatus(id: number, status: IOrder['status'], actionedBy: number, rejectionReason?: string): Promise<void>;
  deductStock(orderId: number): Promise<void>;
  getExportRows(storeId?: number, from?: string, to?: string): Promise<IOrder[]>;
}
