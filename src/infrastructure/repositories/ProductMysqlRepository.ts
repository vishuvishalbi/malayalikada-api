import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IProduct, IProductImage } from '../../domain/entities/Product';
import { IProductRepository, IProductStoreData, ProductListFilters } from '../../domain/repositories/IProductRepository';
import { resolveBrandId, syncProductCategories } from '../products/productWriteHelpers';

export class ProductMysqlRepository implements IProductRepository {
  async findAll(filters: ProductListFilters): Promise<{ products: IProduct[]; total: number }> {
    const conditions: string[] = ['p.deleted_at IS NULL'];
    if (!filters.include_inactive) conditions.push('p.is_active = 1');
    const params: unknown[] = [];

    if (filters.category_id) {
      conditions.push('EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)');
      params.push(filters.category_id);
    }
    if (filters.brand_id) {
      conditions.push('p.brand_id = ?');
      params.push(filters.brand_id);
    }
    if (filters.search) {
      conditions.push('(p.name LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.featured) {
      conditions.push('p.is_featured = 1');
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const orderBy = filters.sort === 'newest' ? 'p.created_at DESC' : 'p.name ASC';

    const storeJoins = filters.store_id
      ? `LEFT JOIN store_pricing sp ON sp.product_id = p.id AND sp.store_id = ${Number(filters.store_id)}
         LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.store_id = ${Number(filters.store_id)}`
      : '';

    const storeFields = filters.store_id
      ? `, sp.price_nzd AS price, COALESCE(ps.quantity, 0) AS stock_quantity, CASE WHEN COALESCE(ps.quantity, 0) > 0 THEN 1 ELSE 0 END AS in_stock`
      : '';

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.*,
              c.name AS category_name,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
              ${storeFields}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       ${storeJoins}
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM products p ${where}`,
      params
    );
    return { products: await this.attachCategories(rows as IProduct[]), total: (countRows[0] as RowDataPacket).total };
  }

  async findById(id: number): Promise<IProduct | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.*, c.name AS category_name,
              COALESCE(AVG(pr.rating), 0) AS rating,
              COUNT(pr.id) AS review_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_reviews pr ON pr.product_id = p.id
       WHERE p.id = ? AND p.deleted_at IS NULL
       GROUP BY p.id, c.name`,
      [id]
    );
    if (!rows[0]) return null;
    const [product] = await this.attachCategories([rows[0] as IProduct]);
    return product;
  }

  async findByBarcode(barcode: string): Promise<IProduct | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM products WHERE barcode = ? AND deleted_at IS NULL',
      [barcode]
    );
    return (rows[0] as IProduct) || null;
  }

  async findStoreData(productId: number, storeId: number): Promise<IProductStoreData> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT sp.price_nzd AS price, COALESCE(ps.quantity, 0) AS stock_quantity
       FROM products p
       LEFT JOIN store_pricing sp ON sp.product_id = p.id AND sp.store_id = ?
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.store_id = ?
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [storeId, storeId, productId]
    );
    const row = rows[0] as RowDataPacket;
    const stock_quantity = Number(row?.stock_quantity ?? 0);
    return {
      price: row?.price != null ? Number(row.price) : null,
      stock_quantity,
      in_stock: stock_quantity > 0,
    };
  }

  async findRelated(categoryId: number, excludeId: number, storeId?: number, limit = 8): Promise<IProduct[]> {
    const storeJoins = storeId
      ? `LEFT JOIN store_pricing sp ON sp.product_id = p.id AND sp.store_id = ${Number(storeId)}
         LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.store_id = ${Number(storeId)}`
      : '';
    const storeFields = storeId
      ? `, sp.price_nzd AS price, COALESCE(ps.quantity, 0) AS stock_quantity, CASE WHEN COALESCE(ps.quantity, 0) > 0 THEN 1 ELSE 0 END AS in_stock`
      : '';

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.*,
              c.name AS category_name,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
              ${storeFields}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       ${storeJoins}
       WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1 AND p.deleted_at IS NULL
       ORDER BY p.is_featured DESC, p.name ASC
       LIMIT ?`,
      [categoryId, excludeId, limit]
    );
    return this.attachCategories(rows as IProduct[]);
  }

  async create(data: Omit<IProduct, 'id' | 'deleted_at' | 'created_at' | 'updated_at' | 'first_image_url'>): Promise<IProduct> {
    const brand = await this.resolveBrand(data);
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO products (barcode, name, description, category_id, brand, brand_id, unit, weight, supplier, is_active, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.barcode, data.name, data.description ?? null, data.category_id, brand.name, brand.id, data.unit ?? null, data.weight ?? null, data.supplier ?? null, data.is_active ? 1 : 0, data.is_featured ? 1 : 0]
    );
    await syncProductCategories(db, result.insertId, data.category_id, data.category_ids);
    return (await this.findById(result.insertId))!;
  }

  async update(id: number, data: Partial<Omit<IProduct, 'id' | 'created_at' | 'updated_at'>>): Promise<IProduct | null> {
    const ALLOWED = ['barcode', 'name', 'description', 'category_id', 'brand', 'brand_id', 'unit', 'weight', 'supplier', 'is_active', 'is_featured', 'deleted_at'];
    const patch: Record<string, unknown> = { ...data };
    if ('brand' in data || 'brand_id' in data) {
      const brand = await this.resolveBrand(data);
      patch.brand = brand.name;
      patch.brand_id = brand.id;
    }
    const entries = Object.entries(patch).filter(([k]) => ALLOWED.includes(k));
    if (entries.length > 0) {
      const fields = entries.map(([k]) => `${k} = ?`).join(', ');
      await db.query(`UPDATE products SET ${fields}, updated_at = NOW() WHERE id = ?`, [...entries.map(([, v]) => v), id]);
    }
    if (data.category_ids !== undefined || data.category_id !== undefined) {
      const [cur] = await db.query<RowDataPacket[]>('SELECT category_id FROM products WHERE id = ?', [id]);
      if (cur[0]) await syncProductCategories(db, id, cur[0].category_id, data.category_ids);
    }
    return this.findById(id);
  }

  /** brand_id wins; else a brand name is find-or-created. Returns the denormalised pair to store. */
  private async resolveBrand(data: { brand?: string | null; brand_id?: number | null }): Promise<{ id: number | null; name: string | null }> {
    if (data.brand_id) {
      const [rows] = await db.query<RowDataPacket[]>('SELECT id, name FROM brands WHERE id = ? AND deleted_at IS NULL', [data.brand_id]);
      if (rows[0]) return { id: rows[0].id, name: rows[0].name };
    }
    const id = await resolveBrandId(db, data.brand);
    return { id, name: id ? data.brand!.trim() : null };
  }

  async softDelete(id: number): Promise<void> {
    await db.query(
      'UPDATE products SET is_active = 0, deleted_at = NOW(), updated_at = NOW() WHERE id = ?',
      [id]
    );
  }

  async addImage(productId: number, filename: string, sortOrder: number): Promise<IProductImage> {
    const path = `/uploads/${filename}`;
    const [result] = await db.query<ResultSetHeader>(
      'INSERT INTO product_images (product_id, filename, path, sort_order) VALUES (?, ?, ?, ?)',
      [productId, filename, path, sortOrder]
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

  async isFavorited(productId: number, customerId: number): Promise<boolean> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT 1 FROM favorites WHERE product_id = ? AND customer_id = ? LIMIT 1',
      [productId, customerId]
    );
    return rows.length > 0;
  }

  async findFavoritedIds(customerId: number, productIds: number[]): Promise<number[]> {
    if (productIds.length === 0) return [];
    const placeholders = productIds.map(() => '?').join(',');
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT product_id FROM favorites WHERE customer_id = ? AND product_id IN (${placeholders})`,
      [customerId, ...productIds],
    );
    return (rows as RowDataPacket[]).map(r => r.product_id as number);
  }

  async findBrands(): Promise<string[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT name AS brand FROM brands WHERE deleted_at IS NULL ORDER BY name ASC`,
    );
    return (rows as RowDataPacket[]).map(r => r.brand as string);
  }

  async isNotifyRequested(productId: number, customerId: number, storeId: number): Promise<boolean> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT 1 FROM notify_requests WHERE product_id = ? AND customer_id = ? AND store_id = ? LIMIT 1',
      [productId, customerId, storeId]
    );
    return rows.length > 0;
  }

  async findTrending(storeId?: number, limit = 10): Promise<IProduct[]> {
    const storeJoins = storeId
      ? `LEFT JOIN store_pricing sp ON sp.product_id = p.id AND sp.store_id = ${Number(storeId)}
         LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.store_id = ${Number(storeId)}`
      : '';
    const storeFields = storeId
      ? `, sp.price_nzd AS price, COALESCE(ps.quantity, 0) AS stock_quantity, CASE WHEN COALESCE(ps.quantity, 0) > 0 THEN 1 ELSE 0 END AS in_stock`
      : '';

    const storeFilter = storeId ? `AND o.store_id = ${Number(storeId)}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.*,
              c.name AS category_name,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
              ${storeFields}
       FROM products p
       INNER JOIN (
         SELECT oi.product_id, COUNT(*) AS order_count
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id ${storeFilter}
         GROUP BY oi.product_id
         ORDER BY order_count DESC
         LIMIT ?
       ) AS trending ON trending.product_id = p.id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       ${storeJoins}
       WHERE p.is_active = 1 AND p.deleted_at IS NULL
       ORDER BY trending.order_count DESC`,
      [limit]
    );

    if ((rows as IProduct[]).length > 0) return this.attachCategories(rows as IProduct[]);

    // Fallback: featured products
    const [featuredRows] = await db.query<RowDataPacket[]>(
      `SELECT p.*,
              c.name AS category_name,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
              ${storeFields}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       ${storeJoins}
       WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.is_featured = 1
       ORDER BY p.name ASC
       LIMIT ?`,
      [limit]
    );
    return this.attachCategories(featuredRows as IProduct[]);
  }

  /** Populates category_ids / categories for a page of products in one query. */
  private async attachCategories(products: IProduct[]): Promise<IProduct[]> {
    if (products.length === 0) return products;
    const ids = products.map(p => p.id);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT pc.product_id, c.id, c.name
       FROM product_categories pc
       JOIN categories c ON c.id = pc.category_id AND c.deleted_at IS NULL
       WHERE pc.product_id IN (${ids.map(() => '?').join(',')})
       ORDER BY c.sort_order, c.name`,
      ids
    );
    const byProduct = new Map<number, { id: number; name: string }[]>();
    for (const r of rows as any[]) {
      const list = byProduct.get(r.product_id) ?? [];
      list.push({ id: r.id, name: r.name });
      byProduct.set(r.product_id, list);
    }
    return products.map(p => {
      const cats = byProduct.get(p.id) ?? (p.category_id ? [{ id: p.category_id, name: p.category_name ?? '' }] : []);
      return { ...p, categories: cats, category_ids: cats.map(c => c.id) };
    });
  }
}
