import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { ICustomer } from '../../domain/entities/Customer';
import { ICustomerRepository } from '../../domain/repositories/ICustomerRepository';

export class CustomerMysqlRepository implements ICustomerRepository {
  async findByIdentifier(identifier: string): Promise<ICustomer | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM customers WHERE identifier = ? AND deleted_at IS NULL',
      [identifier]
    );
    return (rows[0] as ICustomer) || null;
  }

  async findById(id: number): Promise<ICustomer | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    return (rows[0] as ICustomer) || null;
  }

  async findAll(search?: string, offset = 0, limit = 20): Promise<{ items: ICustomer[]; total: number }> {
    const where = search
      ? 'WHERE deleted_at IS NULL AND (identifier LIKE ? OR first_name LIKE ? OR last_name LIKE ?)'
      : 'WHERE deleted_at IS NULL';
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM customers ${where}`,
      params
    );
    return { items: rows as ICustomer[], total: (countRows[0] as any).total };
  }

  async create(data: Omit<ICustomer, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>): Promise<ICustomer> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO customers (identifier, identifier_type, password_hash, first_name, last_name, preferred_store_id) VALUES (?, ?, ?, ?, ?, ?)',
      [data.identifier, data.identifier_type, data.password_hash, data.first_name, data.last_name, data.preferred_store_id ?? null]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<ICustomer, 'id' | 'created_at' | 'updated_at'>>): Promise<ICustomer | null> {
    const ALLOWED_COLUMNS = ['identifier', 'identifier_type', 'password_hash', 'first_name', 'last_name', 'preferred_store_id', 'deleted_at'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED_COLUMNS.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE customers SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async softDelete(id: number): Promise<void> {
    await db.query('UPDATE customers SET deleted_at = NOW() WHERE id = ?', [id]);
  }
}
