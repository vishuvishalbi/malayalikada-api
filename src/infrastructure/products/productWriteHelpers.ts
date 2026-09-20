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
 *
 * Returns every category id touched (old set ∪ new set) so the caller can
 * recount: a category the product just *left* needs its badge updated too.
 */
export async function syncProductCategories(
  q: Queryable,
  productId: number,
  primaryCategoryId: number,
  categoryIds: number[] = [],
): Promise<number[]> {
  const ids = Array.from(new Set([primaryCategoryId, ...categoryIds])).filter(Boolean);
  const [before] = await q.query<RowDataPacket[]>(
    'SELECT category_id FROM product_categories WHERE product_id = ?',
    [productId]
  );
  await q.query(
    `DELETE FROM product_categories WHERE product_id = ? AND category_id NOT IN (${ids.map(() => '?').join(',')})`,
    [productId, ...ids]
  );
  await q.query(
    `INSERT IGNORE INTO product_categories (product_id, category_id) VALUES ${ids.map(() => '(?, ?)').join(',')}`,
    ids.flatMap(id => [productId, id])
  );
  return Array.from(new Set([...ids, ...before.map(r => r.category_id as number)]));
}

/** Importers only know the primary category: make sure it is in the join table. */
export async function ensurePrimaryCategory(q: Queryable, productId: number, categoryId: number): Promise<void> {
  await q.query('INSERT IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)', [productId, categoryId]);
}

/**
 * Recomputes `categories.product_count` for the given categories from the
 * join table. Counts only live, active products — the same predicate the
 * customer-facing product list uses, so the badge matches what a tap shows.
 *
 * Bounded by the ids passed in (a product write touches a handful), and a
 * no-op when called with none. Safe to call inside the write's transaction.
 */
export async function recountCategories(q: Queryable, categoryIds: number[]): Promise<void> {
  const ids = Array.from(new Set(categoryIds)).filter(Boolean);
  if (ids.length === 0) return;
  await q.query(
    `UPDATE categories c
        SET c.product_count = (
              SELECT COUNT(DISTINCT pc.product_id)
                FROM product_categories pc
                JOIN products p ON p.id = pc.product_id
               WHERE pc.category_id = c.id
                 AND p.deleted_at IS NULL
                 AND p.is_active = 1
            )
      WHERE c.id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
}

/** All categories a product currently belongs to — for recounts after delete. */
export async function categoryIdsForProduct(q: Queryable, productId: number): Promise<number[]> {
  const [rows] = await q.query<RowDataPacket[]>(
    'SELECT category_id FROM product_categories WHERE product_id = ?',
    [productId]
  );
  return rows.map(r => r.category_id as number);
}
