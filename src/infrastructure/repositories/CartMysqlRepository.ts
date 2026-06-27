import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { ICart } from '../../domain/entities/Cart';
import { ICartRepository } from '../../domain/repositories/ICartRepository';

export class CartMysqlRepository implements ICartRepository {
  async findByCustomer(customerId: number): Promise<ICart | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM carts WHERE customer_id = ?',
      [customerId]
    );
    if (!rows[0]) return null;
    const row = rows[0] as any;
    return {
      customer_id: row.customer_id,
      store_id: row.store_id,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      updated_at: row.updated_at,
    };
  }

  async upsert(customerId: number, storeId: number, items: ICart['items']): Promise<ICart> {
    await db.query(
      `INSERT INTO carts (customer_id, store_id, items, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), items = VALUES(items), updated_at = NOW()`,
      [customerId, storeId, JSON.stringify(items)]
    );
    return (await this.findByCustomer(customerId))!;
  }

  async clear(customerId: number): Promise<void> {
    await db.query('DELETE FROM carts WHERE customer_id = ?', [customerId]);
  }
}
