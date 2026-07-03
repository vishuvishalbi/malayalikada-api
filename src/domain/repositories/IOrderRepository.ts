import { IOrder, IOrderItem } from '../entities/Order';

export interface OrderListFilters {
  storeId?: number;
  status?: IOrder['status'];
  from?: string;
  to?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface OrderRow extends IOrder {
  customer_name: string;
  store_name: string;
}

export interface AdminOrderDetail extends IOrder {
  customer_name: string;
  customer_identifier: string;
  store_name: string;
  items: (IOrderItem & { name: string })[];
}

export interface ExportRow {
  reference_no: string;
  created_at: Date;
  customer_name: string;
  customer_identifier: string;
  store_name: string;
  status: string;
  payment_status: string;
  item_count: number;
  total_nzd: number;
}

export interface IOrderRepository {
  create(order: Omit<IOrder, 'id' | 'created_at' | 'updated_at'>, items: Omit<IOrderItem, 'id'>[]): Promise<IOrder>;
  findByCustomer(customerId: number, offset: number, limit: number): Promise<{ orders: IOrder[]; total: number }>;
  findById(id: number): Promise<(IOrder & { orderItems: (IOrderItem & { name: string })[] }) | null>;
  findAdminDetail(id: number): Promise<AdminOrderDetail | null>;
  findWorkerQueue(storeIds: number[]): Promise<OrderRow[]>;
  findWorkerCompleted(storeIds: number[], page: number, limit: number): Promise<{ orders: OrderRow[]; total: number }>;
  findAllAdmin(filters: OrderListFilters): Promise<{ orders: OrderRow[]; total: number }>;
  updateStatus(id: number, status: IOrder['status'], actionedBy: number, rejectionReason?: string): Promise<void>;
  deductStock(orderId: number): Promise<void>;
  getExportRows(storeId?: number, from?: string, to?: string): Promise<ExportRow[]>;
}
