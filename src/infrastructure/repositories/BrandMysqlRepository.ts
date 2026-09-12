import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IBrand } from '../../domain/entities/Brand';
import { IBrandRepository } from '../../domain/repositories/IBrandRepository';
import { resolveBrandId } from '../products/productWriteHelpers';

export class BrandMysqlRepository implements IBrandRepository {
  async findAll(): Promise<IBrand[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT b.*, COUNT(p.id) AS product_count
       FROM brands b
       LEFT JOIN products p ON p.brand_id = b.id AND p.deleted_at IS NULL
       WHERE b.deleted_at IS NULL
       GROUP BY b.id
       ORDER BY b.name ASC`
    );
    return rows as IBrand[];
  }

  async findById(id: number): Promise<IBrand | null> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM brands WHERE id = ? AND deleted_at IS NULL', [id]);
    return (rows[0] as IBrand) || null;
  }

  async findByName(name: string): Promise<IBrand | null> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM brands WHERE name = ? AND deleted_at IS NULL', [name.trim()]);
    return (rows[0] as IBrand) || null;
  }

  findOrCreateByName(name: string): Promise<number> {
    return resolveBrandId(db, name) as Promise<number>;
  }

  async create(data: { name: string }): Promise<IBrand> {
    const [result] = await db.query<ResultSetHeader>('INSERT INTO brands (name) VALUES (?)', [data.name.trim()]);
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<{ name: string; logo_filename: string | null }>): Promise<IBrand | null> {
    const entries = Object.entries(data).filter(([k]) => ['name', 'logo_filename'].includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    await db.query(`UPDATE brands SET ${fields}, updated_at = NOW() WHERE id = ?`, [...entries.map(([, v]) => v), id]);
    // Keep the denormalised products.brand display name in step with a rename.
    if (data.name) await db.query('UPDATE products SET brand = ? WHERE brand_id = ?', [data.name.trim(), id]);
    return this.findById(id);
  }

  async softDelete(id: number): Promise<void> {
    await db.query('UPDATE brands SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
    await db.query('UPDATE products SET brand_id = NULL, brand = NULL WHERE brand_id = ?', [id]);
  }
}
