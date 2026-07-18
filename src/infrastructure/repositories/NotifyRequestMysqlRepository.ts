import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { INotifyRequest } from '../../domain/entities/NotifyRequest';
import { INotifyRequestRepository } from '../../domain/repositories/INotifyRequestRepository';

export class NotifyRequestMysqlRepository implements INotifyRequestRepository {
  async upsert(data: Pick<INotifyRequest, 'customer_id' | 'product_id' | 'store_id'>): Promise<INotifyRequest> {
    await db.query(
      `INSERT INTO notify_requests (customer_id, product_id, store_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [data.customer_id, data.product_id, data.store_id]
    );
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM notify_requests WHERE customer_id = ? AND product_id = ? AND store_id = ?',
      [data.customer_id, data.product_id, data.store_id]
    );
    return rows[0] as INotifyRequest;
  }

  async findAll(storeId?: number): Promise<INotifyRequest[]> {
    const where = storeId ? 'WHERE nr.store_id = ?' : '';
    const params = storeId ? [storeId] : [];
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT nr.*, p.name AS product_name, s.name AS store_name,
              CONCAT(c.first_name, ' ', c.last_name) AS customer_name
       FROM notify_requests nr
       JOIN products p ON p.id = nr.product_id
       JOIN stores s ON s.id = nr.store_id
       JOIN customers c ON c.id = nr.customer_id
       ${where}
       ORDER BY nr.created_at DESC`,
      params
    );
    return rows as INotifyRequest[];
  }

  async deleteById(id: number): Promise<void> {
    await db.query('DELETE FROM notify_requests WHERE id = ?', [id]);
  }
}
