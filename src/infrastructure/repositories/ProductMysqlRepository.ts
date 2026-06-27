import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IProduct, IProductImage } from '../../domain/entities/Product';
import { IProductRepository, ProductListFilters } from '../../domain/repositories/IProductRepository';

export class ProductMysqlRepository implements IProductRepository {
  async findAll(filters: ProductListFilters): Promise<{ items: IProduct[]; total: number }> {
    const conditions: string[] = ['p.is_active = 1', 'p.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filters.category_id) {
      conditions.push('p.category_id = ?');
      params.push(filters.category_id);
    }
    if (filters.search) {
      conditions.push('(p.name LIKE ? OR p.barcode LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.featured) {
      conditions.push('p.is_featured = 1');
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const orderBy = filters.sort === 'newest' ? 'p.created_at DESC' : 'p.name ASC';

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.*,
              pi.url AS first_image_url
       FROM products p
       LEFT JOIN (
         SELECT pi2.product_id, CONCAT('/uploads/', pi2.filename) AS url
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM products p ${where}`,
      params
    );
    return { items: rows as IProduct[], total: (countRows[0] as RowDataPacket).total };
  }

  async findById(id: number): Promise<IProduct | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    return (rows[0] as IProduct) || null;
  }

  async findByBarcode(barcode: string): Promise<IProduct | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM products WHERE barcode = ? AND deleted_at IS NULL',
      [barcode]
    );
    return (rows[0] as IProduct) || null;
  }

  async create(data: Omit<IProduct, 'id' | 'deleted_at' | 'created_at' | 'updated_at' | 'first_image_url'>): Promise<IProduct> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO products (barcode, name, description, category_id, brand, unit, weight, supplier, is_active, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.barcode, data.name, data.description ?? null, data.category_id, data.brand ?? null, data.unit ?? null, data.weight ?? null, data.supplier ?? null, data.is_active ? 1 : 0, data.is_featured ? 1 : 0]
    );
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<IProduct, 'id' | 'created_at' | 'updated_at'>>): Promise<IProduct | null> {
    const ALLOWED = ['barcode', 'name', 'description', 'category_id', 'brand', 'unit', 'weight', 'supplier', 'is_active', 'is_featured', 'deleted_at'];
    const entries = Object.entries(data).filter(([k]) => ALLOWED.includes(k));
    if (entries.length === 0) return this.findById(id);
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), id];
    await db.query(`UPDATE products SET ${fields}, updated_at = NOW() WHERE id = ?`, values);
    return this.findById(id);
  }

  async softDelete(id: number): Promise<void> {
    await db.query(
      'UPDATE products SET is_active = 0, deleted_at = NOW(), updated_at = NOW() WHERE id = ?',
      [id]
    );
  }

  async addImage(productId: number, filename: string, sortOrder: number): Promise<IProductImage> {
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO product_images (product_id, filename, sort_order) VALUES (?, ?, ?)',
      [productId, filename, sortOrder]
    );
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM product_images WHERE id = ?',
      [result.insertId]
    );
    return rows[0] as IProductImage;
  }

  async removeImage(productId: number, imageId: number): Promise<void> {
    await db.query(
      'DELETE FROM product_images WHERE id = ? AND product_id = ?',
      [imageId, productId]
    );
  }

  async getImageCount(productId: number): Promise<number> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT COUNT(*) as cnt FROM product_images WHERE product_id = ?',
      [productId]
    );
    return (rows[0] as RowDataPacket).cnt;
  }

  async getImages(productId: number): Promise<IProductImage[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [productId]
    );
    return rows as IProductImage[];
  }
}
