import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IStore } from '../../domain/entities/Store';
import { IStoreRepository } from '../../domain/repositories/IStoreRepository';

export class StoreMysqlRepository implements IStoreRepository {
  async findAll(): Promise<IStore[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM stores WHERE is_active = 1 ORDER BY name'
    );
    return rows as IStore[];
  }

  async findById(id: number): Promise<IStore | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM stores WHERE id = ?',
      [id]
    );
    return (rows[0] as IStore) || null;
  }

  async create(data: Omit<IStore, 'id' | 'created_at' | 'updated_at'>): Promise<IStore> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO stores (name, address, phone, bank_account, icon, logo_filename, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.address, data.phone, data.bank_account ?? null, data.icon ?? null, data.logo_filename ?? null, data.is_active ? 1 : 0]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<IStore, 'id' | 'created_at' | 'updated_at'>>): Promise<IStore | null> {
    const ALLOWED = ['name', 'address', 'phone', 'bank_account', 'icon', 'logo_filename', 'is_active'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE stores SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async deactivate(id: number): Promise<void> {
    await db.query('UPDATE stores SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
  }
}
