import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { IFavorite } from '../../domain/entities/Favorite';
import { IFavoriteRepository } from '../../domain/repositories/IFavoriteRepository';

export class FavoriteMysqlRepository implements IFavoriteRepository {
  async add(customerId: number, productId: number): Promise<IFavorite> {
    await db.query<ResultSetHeader>(
      `INSERT IGNORE INTO favorites (customer_id, product_id) VALUES (?, ?)`,
      [customerId, productId]
    );
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM favorites WHERE customer_id = ? AND product_id = ?',
      [customerId, productId]
    );
    return rows[0] as IFavorite;
  }

  async remove(customerId: number, productId: number): Promise<void> {
    await db.query(
      'DELETE FROM favorites WHERE customer_id = ? AND product_id = ?',
      [customerId, productId]
    );
  }

  async list(customerId: number): Promise<IFavorite[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT f.*,
              p.name AS product_name,
              p.id AS product_id,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
       FROM favorites f
       INNER JOIN products p ON p.id = f.product_id AND p.deleted_at IS NULL
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       WHERE f.customer_id = ?
       ORDER BY f.created_at DESC`,
      [customerId]
    );
    return rows as IFavorite[];
  }
}
