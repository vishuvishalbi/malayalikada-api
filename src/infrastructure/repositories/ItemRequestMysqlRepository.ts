import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IItemRequest } from '../../domain/entities/ItemRequest';
import { IItemRequestRepository } from '../../domain/repositories/IItemRequestRepository';

export class ItemRequestMysqlRepository implements IItemRequestRepository {
  async create(data: Omit<IItemRequest, 'id' | 'created_at' | 'updated_at'>): Promise<IItemRequest> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO item_requests (customer_id, store_id, product_name, barcode, notes, quantity, status, admin_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.customer_id, data.store_id, data.product_name, data.barcode ?? null, data.notes ?? null, data.quantity ?? 1, data.status, data.admin_notes ?? null]
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

  async findAllAdmin(storeId?: number, status?: IItemRequest['status']): Promise<(IItemRequest & { customer_name: string | null })[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (storeId) { conditions.push('ir.store_id = ?'); params.push(storeId); }
    if (status) { conditions.push('ir.status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ir.*, CONCAT(c.first_name, ' ', c.last_name) AS customer_name FROM item_requests ir LEFT JOIN customers c ON c.id = ir.customer_id ${where} ORDER BY ir.created_at DESC`,
      params
    );
    return rows as (IItemRequest & { customer_name: string | null })[];
  }

  async updateStatus(id: number, status: IItemRequest['status'], adminNotes?: string): Promise<IItemRequest> {
    await db.query(
      'UPDATE item_requests SET status = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?',
      [status, adminNotes ?? null, id]
    );
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM item_requests WHERE id = ?', [id]);
    return rows[0] as IItemRequest;
  }
}
