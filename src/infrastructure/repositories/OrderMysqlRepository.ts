import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IOrder, IOrderItem } from '../../domain/entities/Order';
import { IOrderRepository, OrderListFilters, OrderRow, AdminOrderDetail, ExportRow } from '../../domain/repositories/IOrderRepository';
import { generateReferenceNumber } from '../../shared/utils';
import { ValidationError } from '../../shared/errors/AppError';

const CUSTOMER_NAME_EXPR = "CONCAT(c.first_name, ' ', c.last_name)";

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
        `INSERT INTO orders (reference_no, customer_id, store_id, status, total_nzd, delivery_fee_nzd, total_weight_kg, stripe_payment_intent_id, payment_status, rejection_reason, actioned_by, actioned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [referenceNo, order.customer_id, order.store_id, order.status, order.total_nzd,
         order.delivery_fee_nzd ?? 0, order.total_weight_kg ?? 0,
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

  async setPaymentIntent(orderId: number, paymentIntentId: string): Promise<void> {
    await db.query(
      'UPDATE orders SET stripe_payment_intent_id = ?, updated_at = NOW() WHERE id = ?',
      [paymentIntentId, orderId]
    );
  }

  async markPaid(orderId: number): Promise<void> {
    await db.query(
      "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = ?",
      [orderId]
    );
  }

  async findByCustomer(customerId: number, offset: number, limit: number): Promise<{ orders: IOrder[]; total: number }> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.*, s.name AS store_name FROM orders o
       LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [customerId, limit, offset]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM orders WHERE customer_id = ?',
      [customerId]
    );
    return { orders: rows as IOrder[], total: (countRows[0] as any).total };
  }

  async findById(id: number): Promise<(IOrder & { store_name?: string; orderItems: (IOrderItem & { name: string; product_name: string })[] }) | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.*, s.name AS store_name FROM orders o
       LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const [itemRows] = await db.query<RowDataPacket[]>(
      `SELECT oi.*, p.name AS product_name FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [id]
    );
    return { ...(rows[0] as IOrder), orderItems: itemRows as (IOrderItem & { name: string; product_name: string })[] };
  }

  async findAdminDetail(id: number): Promise<AdminOrderDetail | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.*,
              ${CUSTOMER_NAME_EXPR} AS customer_name,
              c.identifier AS customer_identifier,
              s.name AS store_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN stores s ON s.id = o.store_id
       WHERE o.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const [itemRows] = await db.query<RowDataPacket[]>(
      `SELECT oi.*, p.name AS product_name FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [id]
    );
    const row = rows[0] as any;
    return {
      ...row,
      items: itemRows as (IOrderItem & { name: string })[],
    } as AdminOrderDetail;
  }

  async findWorkerQueue(storeIds: number[]): Promise<OrderRow[]> {
    if (storeIds.length === 0) return [];
    const placeholders = storeIds.map(() => '?').join(',');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.*,
              ${CUSTOMER_NAME_EXPR} AS customer_name,
              s.name AS store_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN stores s ON s.id = o.store_id
       WHERE o.store_id IN (${placeholders}) AND o.status = 'pending_approval'
       ORDER BY o.created_at ASC`,
      storeIds
    );
    if ((rows as any[]).length === 0) return [];
    const orderIds = (rows as any[]).map(r => r.id);
    const itemPlaceholders = orderIds.map(() => '?').join(',');
    const [itemRows] = await db.query<RowDataPacket[]>(
      `SELECT oi.*, p.name AS product_name FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (${itemPlaceholders})`,
      orderIds
    );
    const itemsByOrder = new Map<number, any[]>();
    for (const item of itemRows as any[]) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }
    return (rows as any[]).map(r => ({ ...r, orderItems: itemsByOrder.get(r.id) ?? [] })) as OrderRow[];
  }

  async findWorkerCompleted(storeIds: number[], page: number, limit: number): Promise<{ orders: OrderRow[]; total: number }> {
    const offset = (page - 1) * limit;
    let whereClause: string;
    let params: unknown[];

    if (storeIds.length === 0) {
      // admin: all stores
      whereClause = "WHERE o.status IN ('approved', 'rejected')";
      params = [];
    } else {
      const placeholders = storeIds.map(() => '?').join(',');
      whereClause = `WHERE o.store_id IN (${placeholders}) AND o.status IN ('approved', 'rejected')`;
      params = storeIds;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.*,
              ${CUSTOMER_NAME_EXPR} AS customer_name,
              s.name AS store_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN stores s ON s.id = o.store_id
       ${whereClause}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      params
    );
    return { orders: rows as OrderRow[], total: (countRows[0] as any).total };
  }

  async findAllAdmin(filters: OrderListFilters): Promise<{ orders: OrderRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.storeId) { conditions.push('o.store_id = ?'); params.push(filters.storeId); }
    if (filters.status) { conditions.push('o.status = ?'); params.push(filters.status); }
    if (filters.from) { conditions.push('o.created_at >= ?'); params.push(filters.from); }
    if (filters.to) { conditions.push('o.created_at <= ?'); params.push(filters.to + ' 23:59:59'); }
    if (filters.search) { conditions.push('o.reference_no LIKE ?'); params.push(`%${filters.search}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.*,
              ${CUSTOMER_NAME_EXPR} AS customer_name,
              s.name AS store_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN stores s ON s.id = o.store_id
       ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN stores s ON s.id = o.store_id
       ${where}`,
      params
    );
    return { orders: rows as OrderRow[], total: (countRows[0] as any).total };
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

  async getExportRows(storeId?: number, from?: string, to?: string): Promise<ExportRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (storeId) { conditions.push('o.store_id = ?'); params.push(storeId); }
    if (from) { conditions.push('o.created_at >= ?'); params.push(from); }
    if (to) { conditions.push('o.created_at <= ?'); params.push(to + ' 23:59:59'); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT o.reference_no, o.created_at,
              ${CUSTOMER_NAME_EXPR} AS customer_name,
              c.identifier AS customer_identifier,
              s.name AS store_name,
              o.status, o.payment_status, o.total_nzd, o.delivery_fee_nzd,
              COUNT(oi.id) AS item_count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN stores s ON s.id = o.store_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${where}
       GROUP BY o.id, o.reference_no, o.created_at, c.first_name, c.last_name, c.identifier, s.name, o.status, o.payment_status, o.total_nzd, o.delivery_fee_nzd
       ORDER BY o.created_at DESC`,
      params
    );
    return rows as ExportRow[];
  }
}
