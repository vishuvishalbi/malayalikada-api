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
}
