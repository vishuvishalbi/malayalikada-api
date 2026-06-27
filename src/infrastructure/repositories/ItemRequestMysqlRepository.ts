import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IItemRequest } from '../../domain/entities/ItemRequest';
import { IItemRequestRepository } from '../../domain/repositories/IItemRequestRepository';

export class ItemRequestMysqlRepository implements IItemRequestRepository {
  async create(data: Omit<IItemRequest, 'id' | 'created_at' | 'updated_at'>): Promise<IItemRequest> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO item_requests (customer_id, store_id, product_name, barcode, notes, status, admin_notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.customer_id, data.store_id, data.product_name, data.barcode ?? null, data.notes ?? null, data.status, data.admin_notes ?? null]
    );
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM item_requests WHERE id = ?', [result.insertId]);
    return rows[0] as IItemRequest;
  }

  async findByCustomer(customerId: number): Promise<IItemRequest[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM item_requests WHERE customer_id = ? ORDER BY created_at DESC',
      [customerId]
    );
    return rows as IItemRequest[];
  }

  async findAllAdmin(storeId?: number, status?: IItemRequest['status']): Promise<IItemRequest[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (storeId) { conditions.push('store_id = ?'); params.push(storeId); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM item_requests ${where} ORDER BY created_at DESC`,
      params
    );
    return rows as IItemRequest[];
  }

  async updateStatus(id: number, status: IItemRequest['status'], adminNotes?: string): Promise<void> {
    await db.query(
      'UPDATE item_requests SET status = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?',
      [status, adminNotes ?? null, id]
    );
  }
}
