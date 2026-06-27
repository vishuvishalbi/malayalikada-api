import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { ICategory } from '../../domain/entities/Category';
import { ICategoryRepository } from '../../domain/repositories/ICategoryRepository';

export class CategoryMysqlRepository implements ICategoryRepository {
  async findAll(): Promise<ICategory[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name'
    );
    return rows as ICategory[];
  }

  async findById(id: number): Promise<ICategory | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    return (rows[0] as ICategory) || null;
  }

  async create(data: Omit<ICategory, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>): Promise<ICategory> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO categories (name, icon, image_filename, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.icon ?? null, data.image_filename ?? null, data.parent_id ?? null, data.sort_order]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<ICategory, 'id' | 'created_at' | 'updated_at'>>): Promise<ICategory | null> {
    const ALLOWED = ['name', 'icon', 'image_filename', 'parent_id', 'sort_order', 'deleted_at'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE categories SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async softDelete(id: number): Promise<void> {
    await db.query(
      'UPDATE categories SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?',
      [id]
    );
  }
}
