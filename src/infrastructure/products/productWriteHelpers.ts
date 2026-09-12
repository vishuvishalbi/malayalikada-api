import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/** Anything that can run a query: the pool or a transaction connection. */
export type Queryable = Pool | PoolConnection;

/**
 * Resolves a free-text brand name to a brands.id, creating the row on first
 * sight. Shared by admin product writes and every CSV/EPOS importer so all
 * paths converge on the same brand entity. Returns null for blank names.
 */
export async function resolveBrandId(q: Queryable, name: string | null | undefined): Promise<number | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const [rows] = await q.query<RowDataPacket[]>(
    'SELECT id FROM brands WHERE name = ? LIMIT 1',
    [trimmed]
  );
  if (rows[0]) {
    if (rows[0].deleted_at) await q.query('UPDATE brands SET deleted_at = NULL WHERE id = ?', [rows[0].id]);
    return rows[0].id as number;
  }
  const [result] = await q.query<ResultSetHeader>('INSERT INTO brands (name) VALUES (?)', [trimmed]);
  return result.insertId;
}

/**
 * Replaces the product's category set. The primary category is always kept
 * so products.category_id and product_categories never disagree.
 */
export async function syncProductCategories(
  q: Queryable,
  productId: number,
  primaryCategoryId: number,
  categoryIds: number[] = [],
): Promise<void> {
  const ids = Array.from(new Set([primaryCategoryId, ...categoryIds])).filter(Boolean);
  await q.query(
    `DELETE FROM product_categories WHERE product_id = ? AND category_id NOT IN (${ids.map(() => '?').join(',')})`,
    [productId, ...ids]
  );
  await q.query(
    `INSERT IGNORE INTO product_categories (product_id, category_id) VALUES ${ids.map(() => '(?, ?)').join(',')}`,
    ids.flatMap(id => [productId, id])
  );
}

/** Importers only know the primary category: make sure it is in the join table. */
export async function ensurePrimaryCategory(q: Queryable, productId: number, categoryId: number): Promise<void> {
  await q.query('INSERT IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)', [productId, categoryId]);
}
