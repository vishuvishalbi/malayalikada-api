import { IStaffRepository } from '../../domain/repositories/IStaffRepository';
import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';
import { db } from '../../infrastructure/database/connection';
import { RowDataPacket } from 'mysql2/promise';
import { paginate } from '../../shared/utils';
import { NotFoundError } from '../../shared/errors/AppError';
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
    const [lowStockRows] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM product_stock WHERE low_stock_threshold > 0 AND quantity <= low_stock_threshold"
    );

    return {
      ordersToday: (todayRows[0] as any).cnt,
      pendingOrders: (pendingRows[0] as any).cnt,
      completedOrders: (completedRows[0] as any).cnt,
      lowStock: (lowStockRows[0] as any).cnt,
      revenueByStore: (revenueRows as any[]).map(r => ({
        storeId: r.storeId,
        name: r.name,
        revenueNzd: Number(r.revenueNzd),
      })),
    };
  }

  listStaff(includeInactive = false) {
    return this.staff.findAll(includeInactive);
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
    return this.staff.findById(staffUser.id)!;
  }

  async updateStaff(id: number, data: { name?: string; role?: 'worker' | 'admin'; is_active?: boolean; store_ids?: number[] }) {
    const { store_ids, ...staffData } = data;
    await this.staff.update(id, staffData as any);
    if (store_ids !== undefined) {
      await this.staff.setStoreIds(id, store_ids);
    }
    return this.staff.findById(id);
  }

  listCustomers(search?: string, page = 1, limit = 20) {
    const { offset } = paginate(page, limit);
    return this.customers.findAll(search, offset, limit);
  }

  async getCustomer(id: number) {
    const customer = await this.customers.findById(id);
    if (!customer) throw new NotFoundError('Customer not found');
    const [orderRows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    return { ...customer, orders: orderRows };
  }

  async analytics(filters: { from?: string; to?: string; storeId?: number }) {
    // Default to the last 30 days ending today (dates are 'YYYY-MM-DD').
    const to = filters.to ?? new Date().toISOString().slice(0, 10);
    const fromDefault = new Date(`${to}T00:00:00Z`);
    fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
    const from = filters.from ?? fromDefault.toISOString().slice(0, 10);

    // Approved orders only. created_at is a datetime; compare on DATE().
    const storeClause = filters.storeId ? 'AND o.store_id = ?' : '';
    const storeParam = filters.storeId ? [filters.storeId] : [];

    const [totalsRows] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(o.total_nzd), 0) AS totalRevenueNzd, COUNT(*) AS orderCount
         FROM orders o
        WHERE o.status = 'approved' AND DATE(o.created_at) BETWEEN ? AND ? ${storeClause}`,
      [from, to, ...storeParam]
    );
    const totalRevenueNzd = Number((totalsRows[0] as any).totalRevenueNzd) || 0;
    const orderCount = Number((totalsRows[0] as any).orderCount) || 0;

    const [dailyRows] = await db.query<RowDataPacket[]>(
      `SELECT DATE(o.created_at) AS date,
              COALESCE(SUM(o.total_nzd), 0) AS revenueNzd,
              COUNT(*) AS orderCount
         FROM orders o
        WHERE o.status = 'approved' AND DATE(o.created_at) BETWEEN ? AND ? ${storeClause}
        GROUP BY DATE(o.created_at)
        ORDER BY DATE(o.created_at) ASC`,
      [from, to, ...storeParam]
    );

    const [topRows] = await db.query<RowDataPacket[]>(
      `SELECT p.id AS productId, p.name AS name,
              SUM(oi.quantity) AS unitsSold,
              SUM(oi.quantity * oi.unit_price_nzd) AS revenueNzd
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE o.status = 'approved' AND DATE(o.created_at) BETWEEN ? AND ? ${storeClause}
        GROUP BY p.id, p.name
        ORDER BY revenueNzd DESC
        LIMIT 10`,
      [from, to, ...storeParam]
    );

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      from,
      to,
      totalRevenueNzd: round2(totalRevenueNzd),
      orderCount,
      avgOrderValueNzd: orderCount > 0 ? round2(totalRevenueNzd / orderCount) : 0,
      daily: (dailyRows as any[]).map(r => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
        revenueNzd: round2(Number(r.revenueNzd) || 0),
        orderCount: Number(r.orderCount) || 0,
      })),
      topProducts: (topRows as any[]).map(r => ({
        productId: Number(r.productId),
        name: String(r.name),
        unitsSold: Number(r.unitsSold) || 0,
        revenueNzd: round2(Number(r.revenueNzd) || 0),
      })),
    };
  }
}
