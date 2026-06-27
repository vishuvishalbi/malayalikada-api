import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IBanner } from '../../domain/entities/Banner';
import { IBannerRepository } from '../../domain/repositories/IBannerRepository';

export class BannerMysqlRepository implements IBannerRepository {
  async findAllActive(): Promise<IBanner[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order'
    );
    return rows as IBanner[];
  }

  async findById(id: number): Promise<IBanner | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM banners WHERE id = ?',
      [id]
    );
    return (rows[0] as IBanner) || null;
  }

  async create(data: Omit<IBanner, 'id' | 'created_at' | 'updated_at'>): Promise<IBanner> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO banners (title, subtitle, cta_label, cta_route, image_filename, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.title, data.subtitle ?? null, data.cta_label ?? null, data.cta_route ?? null, data.image_filename ?? null, data.is_active ? 1 : 0, data.sort_order]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<IBanner, 'id' | 'created_at' | 'updated_at'>>): Promise<IBanner | null> {
    const ALLOWED = ['title', 'subtitle', 'cta_label', 'cta_route', 'image_filename', 'is_active', 'sort_order'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE banners SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async deactivate(id: number): Promise<void> {
    await db.query('UPDATE banners SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
  }
}
