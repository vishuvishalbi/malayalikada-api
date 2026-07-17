import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { IProductStock } from '../../domain/entities/Product';
import { expireStaleReservations } from '../stock/expireStaleReservations';

export class StockMysqlRepository {
  async findAll(filters: { store_id?: number; product_id?: number; low_stock?: boolean }): Promise<IProductStock[]> {
    if (filters.store_id && filters.product_id) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [filters.product_id, filters.store_id]);
        await expireStaleReservations(conn, filters.product_id, filters.store_id);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
    // NOTE: broad listings (no product_id+store_id pair) intentionally skip
    // inline expiry — looping FOR UPDATE locks over an unbounded result set
    // here would be a self-inflicted contention problem. Reserved_quantity
    // shown in that case may lag by up to 15 minutes until the row is next
    // touched via cart/order activity or a scoped single-product query.

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.store_id) { conditions.push('ps.store_id = ?'); params.push(filters.store_id); }
    if (filters.product_id) { conditions.push('ps.product_id = ?'); params.push(filters.product_id); }
    if (filters.low_stock) { conditions.push('ps.quantity <= ps.low_stock_threshold'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ps.*, p.name AS product_name, p.barcode FROM product_stock ps LEFT JOIN products p ON p.id = ps.product_id ${where} ORDER BY ps.product_id, ps.store_id`,
      params
    );
    return rows as IProductStock[];
  }

  async upsert(productId: number, storeId: number, quantity: number, threshold: number): Promise<IProductStock> {
    await db.query(
      `INSERT INTO product_stock (product_id, store_id, quantity, low_stock_threshold)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), low_stock_threshold = VALUES(low_stock_threshold)`,
      [productId, storeId, quantity, threshold]
    );
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT ps.*, p.name AS product_name FROM product_stock ps LEFT JOIN products p ON p.id = ps.product_id WHERE ps.product_id = ? AND ps.store_id = ?',
      [productId, storeId]
    );
    return rows[0] as IProductStock;
  }
}
