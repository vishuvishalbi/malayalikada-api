import { IStaffRepository } from '../../domain/repositories/IStaffRepository';
import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';
import { db } from '../../infrastructure/database/connection';
import { RowDataPacket } from 'mysql2/promise';
import { paginate } from '../../shared/utils';
import bcrypt from 'bcrypt';

export class AdminService {
  constructor(
    private staff: IStaffRepository,
    private customers: ICustomerRepository,
  ) {}

  async dashboard() {
    const [todayRows] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM orders WHERE DATE(created_at) = CURDATE()"
    );
    const [pendingRows] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM orders WHERE status = 'pending_approval'"
    );
    const [completedRows] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM orders WHERE status = 'approved'"
    );
    const [revenueRows] = await db.query<RowDataPacket[]>(
      `SELECT s.id as storeId, s.name, COALESCE(SUM(o.total_nzd), 0) as revenueNzd
       FROM stores s
       LEFT JOIN orders o ON o.store_id = s.id AND o.status = 'approved'
       WHERE s.is_active = 1
       GROUP BY s.id, s.name
       ORDER BY s.name`
    );

    return {
      ordersToday: (todayRows[0] as any).cnt,
      pendingOrders: (pendingRows[0] as any).cnt,
      completedOrders: (completedRows[0] as any).cnt,
      revenueByStore: (revenueRows as any[]).map(r => ({
        storeId: r.storeId,
        name: r.name,
        revenueNzd: Number(r.revenueNzd),
      })),
    };
  }

  listStaff() {
    return this.staff.findAll();
  }

  async createStaff(data: { identifier: string; identifier_type: 'email' | 'mobile'; password: string; name: string; role: 'worker' | 'admin'; store_ids?: number[] }) {
    const hash = await bcrypt.hash(data.password, 10);
    const staffUser = await this.staff.create({
      identifier: data.identifier,
      identifier_type: data.identifier_type,
      password_hash: hash,
      name: data.name,
      role: data.role,
      is_active: true,
    });
    if (data.store_ids && data.store_ids.length > 0) {
      await this.staff.setStoreIds(staffUser.id, data.store_ids);
    }
    return staffUser;
  }

  async updateStaff(id: number, data: { name?: string; role?: 'worker' | 'admin'; is_active?: boolean; store_ids?: number[] }) {
    const { store_ids, ...staffData } = data;
    const updated = await this.staff.update(id, staffData as any);
    if (store_ids !== undefined) {
      await this.staff.setStoreIds(id, store_ids);
    }
    return updated;
  }

  listCustomers(search?: string, page = 1, limit = 20) {
    const { offset } = paginate(page, limit);
    return this.customers.findAll(search, offset, limit);
  }

  async getCustomer(id: number) {
    const customer = await this.customers.findById(id);
    if (!customer) throw new Error('Customer not found');
    const [orderRows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    return { ...customer, orders: orderRows };
  }
}
