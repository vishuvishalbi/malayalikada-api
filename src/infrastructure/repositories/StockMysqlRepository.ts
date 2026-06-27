import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { IProductStock } from '../../domain/entities/Product';

export class StockMysqlRepository {
  async findAll(filters: { store_id?: number; product_id?: number; low_stock?: boolean }): Promise<IProductStock[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.store_id) { conditions.push('store_id = ?'); params.push(filters.store_id); }
    if (filters.product_id) { conditions.push('product_id = ?'); params.push(filters.product_id); }
    if (filters.low_stock) { conditions.push('quantity <= low_stock_threshold'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM product_stock ${where} ORDER BY product_id, store_id`,
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
      'SELECT * FROM product_stock WHERE product_id = ? AND store_id = ?',
      [productId, storeId]
    );
    return rows[0] as IProductStock;
  }
}
