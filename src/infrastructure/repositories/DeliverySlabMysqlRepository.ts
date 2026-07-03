import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IDeliverySlab } from '../../domain/entities/DeliverySlab';
import { IDeliverySlabRepository } from '../../domain/repositories/IDeliverySlabRepository';

export class DeliverySlabMysqlRepository implements IDeliverySlabRepository {
  async findAll(): Promise<IDeliverySlab[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM delivery_slabs ORDER BY min_weight_kg ASC'
    );
    return rows as IDeliverySlab[];
  }

  async findActive(): Promise<IDeliverySlab[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM delivery_slabs WHERE is_active = 1 ORDER BY min_weight_kg ASC'
    );
    return rows as IDeliverySlab[];
  }

  async findById(id: number): Promise<IDeliverySlab | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM delivery_slabs WHERE id = ?',
      [id]
    );
    return (rows[0] as IDeliverySlab) || null;
  }

  async create(data: Omit<IDeliverySlab, 'id' | 'created_at' | 'updated_at'>): Promise<IDeliverySlab> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO delivery_slabs (min_weight_kg, max_weight_kg, fee_nzd, is_active) VALUES (?, ?, ?, ?)',
      [data.min_weight_kg, data.max_weight_kg ?? null, data.fee_nzd, data.is_active]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<IDeliverySlab, 'id' | 'created_at' | 'updated_at'>>): Promise<IDeliverySlab | null> {
    const ALLOWED = ['min_weight_kg', 'max_weight_kg', 'fee_nzd', 'is_active'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE delivery_slabs SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await db.query('DELETE FROM delivery_slabs WHERE id = ?', [id]);
  }
}
