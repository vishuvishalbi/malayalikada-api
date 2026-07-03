import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IStaffUser } from '../../domain/entities/StaffUser';
import { IStaffRepository } from '../../domain/repositories/IStaffRepository';

export class StaffMysqlRepository implements IStaffRepository {
  async findByIdentifier(identifier: string): Promise<IStaffUser | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM staff_users WHERE identifier = ?',
      [identifier]
    );
    return (rows[0] as IStaffUser) || null;
  }

  async findById(id: number): Promise<IStaffUser | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM staff_users WHERE id = ?',
      [id]
    );
    return (rows[0] as IStaffUser) || null;
  }

  async findAll(includeInactive = false): Promise<IStaffUser[]> {
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM staff_users ${where} ORDER BY name`
    );
    return rows as IStaffUser[];
  }

  async create(data: Omit<IStaffUser, 'id' | 'created_at' | 'updated_at'>): Promise<IStaffUser> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO staff_users (identifier, identifier_type, password_hash, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [data.identifier, data.identifier_type, data.password_hash, data.name, data.role, data.is_active ? 1 : 0]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<IStaffUser, 'id' | 'created_at' | 'updated_at'>>): Promise<IStaffUser | null> {
    const ALLOWED_COLUMNS = ['identifier', 'identifier_type', 'password_hash', 'name', 'role', 'is_active'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED_COLUMNS.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE staff_users SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async getStoreIds(staffId: number): Promise<number[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT store_id FROM staff_stores WHERE staff_id = ?',
      [staffId]
    );
    return rows.map((r: any) => r.store_id);
  }

  async setStoreIds(staffId: number, storeIds: number[]): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM staff_stores WHERE staff_id = ?', [staffId]);
      if (storeIds.length > 0) {
        const values = storeIds.map(sid => [staffId, sid]);
        await conn.query('INSERT INTO staff_stores (staff_id, store_id) VALUES ?', [values]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}
