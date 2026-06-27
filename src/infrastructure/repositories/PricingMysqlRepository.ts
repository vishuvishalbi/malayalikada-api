import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { IStorePricing } from '../../domain/entities/Product';

export class PricingMysqlRepository {
  async findAll(filters: { store_id?: number; product_id?: number }): Promise<IStorePricing[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.store_id) { conditions.push('store_id = ?'); params.push(filters.store_id); }
    if (filters.product_id) { conditions.push('product_id = ?'); params.push(filters.product_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM store_pricing ${where} ORDER BY product_id, store_id`,
      params
    );
    return rows as IStorePricing[];
  }

  async upsert(productId: number, storeId: number, priceNzd: number, effectiveDate: string): Promise<IStorePricing> {
    await db.query(
      `INSERT INTO store_pricing (product_id, store_id, price_nzd, effective_date)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price_nzd = VALUES(price_nzd), effective_date = VALUES(effective_date), updated_at = NOW()`,
      [productId, storeId, priceNzd, effectiveDate]
    );
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM store_pricing WHERE product_id = ? AND store_id = ?',
      [productId, storeId]
    );
    return rows[0] as IStorePricing;
  }
}
