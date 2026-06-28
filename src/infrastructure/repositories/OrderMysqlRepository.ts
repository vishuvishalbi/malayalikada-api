import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IOrder, IOrderItem } from '../../domain/entities/Order';
import { IOrderRepository, OrderListFilters } from '../../domain/repositories/IOrderRepository';
import { generateReferenceNumber } from '../../shared/utils';
import { ValidationError } from '../../shared/errors/AppError';

export class OrderMysqlRepository implements IOrderRepository {
  async create(
    order: Omit<IOrder, 'id' | 'created_at' | 'updated_at'>,
    items: Omit<IOrderItem, 'id'>[]
  ): Promise<IOrder> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const today = new Date();
      const [seqRows] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) as cnt FROM orders WHERE DATE(created_at) = CURDATE()'
      );
      const seq = (seqRows[0] as any).cnt + 1;
      const referenceNo = generateReferenceNumber(today, seq);

      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO orders (reference_no, customer_id, store_id, status, total_nzd, stripe_payment_intent_id, payment_status, rejection_reason, actioned_by, actioned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [referenceNo, order.customer_id, order.store_id, order.status, order.total_nzd,
         order.stripe_payment_intent_id ?? null, order.payment_status,
         order.rejection_reason ?? null, order.actioned_by ?? null, order.actioned_at ?? null]
      );
      const orderId = result.insertId;

      for (const item of items) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price_nzd) VALUES (?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.unit_price_nzd]
        );
      }

      await conn.commit();
      const created = await this.findById(orderId);
      return created!;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async findByCustomer(customerId: number, offset: number, limit: number): Promise<{ orders: IOrder[]; total: number }> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [customerId, limit, offset]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM orders WHERE customer_id = ?',
      [customerId]
    );
    return { orders: rows as IOrder[], total: (countRows[0] as any).total };
  }

  async findById(id: number): Promise<(IOrder & { orderItems: (IOrderItem & { name: string })[] }) | null> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM orders WHERE id = ?', [id]);
    if (!rows[0]) return null;
    const [itemRows] = await db.query<RowDataPacket[]>(
      `SELECT oi.*, p.name FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [id]
    );
    return { ...(rows[0] as IOrder), orderItems: itemRows as (IOrderItem & { name: string })[] };
  }

  async findWorkerQueue(storeIds: number[]): Promise<IOrder[]> {
    if (storeIds.length === 0) return [];
    const placeholders = storeIds.map(() => '?').join(',');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM orders WHERE store_id IN (${placeholders}) AND status = 'pending_approval' ORDER BY created_at ASC`,
      storeIds
    );
    return rows as IOrder[];
  }

  async findAllAdmin(filters: OrderListFilters): Promise<{ orders: IOrder[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.storeId) { conditions.push('store_id = ?'); params.push(filters.storeId); }
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters.from) { conditions.push('created_at >= ?'); params.push(filters.from); }
    if (filters.to) { conditions.push('created_at <= ?'); params.push(filters.to + ' 23:59:59'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM orders ${where}`,
      params
    );
    return { orders: rows as IOrder[], total: (countRows[0] as any).total };
  }

  async updateStatus(id: number, status: IOrder['status'], actionedBy: number, rejectionReason?: string): Promise<void> {
    await db.query(
      'UPDATE orders SET status = ?, actioned_by = ?, actioned_at = NOW(), rejection_reason = ?, updated_at = NOW() WHERE id = ?',
      [status, actionedBy, rejectionReason ?? null, id]
    );
  }

  async deductStock(orderId: number): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [orderRows] = await conn.query<RowDataPacket[]>('SELECT store_id FROM orders WHERE id = ?', [orderId]);
      if (!(orderRows as any)[0]) throw new Error('Order not found');
      const storeId = (orderRows as any)[0].store_id;

      const [items] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM order_items WHERE order_id = ?',
        [orderId]
      );

      const insufficient: Array<{ product_id: number; requested: number; available: number }> = [];
      for (const item of items as any[]) {
        const [stockRows] = await conn.query<RowDataPacket[]>(
          'SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE',
          [item.product_id, storeId]
        );
        const available = (stockRows as any)[0]?.quantity ?? 0;
        if (available < item.quantity) {
          insufficient.push({ product_id: item.product_id, requested: item.quantity, available });
        }
      }

      if (insufficient.length > 0) {
        await conn.rollback();
        throw new ValidationError('Insufficient stock for approval', insufficient);
      }

      for (const item of items as any[]) {
        await conn.query(
          'UPDATE product_stock SET quantity = quantity - ? WHERE product_id = ? AND store_id = ?',
          [item.quantity, item.product_id, storeId]
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async getExportRows(storeId?: number, from?: string, to?: string): Promise<IOrder[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (storeId) { conditions.push('store_id = ?'); params.push(storeId); }
    if (from) { conditions.push('created_at >= ?'); params.push(from); }
    if (to) { conditions.push('created_at <= ?'); params.push(to + ' 23:59:59'); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC`,
      params
    );
    return rows as IOrder[];
  }
}
