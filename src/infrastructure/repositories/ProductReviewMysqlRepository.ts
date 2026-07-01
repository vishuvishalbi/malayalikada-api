import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { IProductReview } from '../../domain/entities/ProductReview';
import { IProductReviewRepository } from '../../domain/repositories/IProductReviewRepository';

export class ProductReviewMysqlRepository implements IProductReviewRepository {
  async findByProduct(productId: number): Promise<IProductReview[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT pr.*, CONCAT(c.first_name, ' ', c.last_name) AS customer_name
       FROM product_reviews pr
       LEFT JOIN customers c ON c.id = pr.customer_id
       WHERE pr.product_id = ?
       ORDER BY pr.created_at DESC`,
      [productId]
    );
    return rows as IProductReview[];
  }

  async upsert(data: Pick<IProductReview, 'product_id' | 'customer_id' | 'rating' | 'comment'>): Promise<IProductReview> {
    await db.query(
      `INSERT INTO product_reviews (product_id, customer_id, rating, comment)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
      [data.product_id, data.customer_id, data.rating, data.comment ?? null]
    );
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM product_reviews WHERE product_id = ? AND customer_id = ?',
      [data.product_id, data.customer_id]
    );
    return rows[0] as IProductReview;
  }

  async getStats(productId: number): Promise<{ rating: number; review_count: number }> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT COALESCE(AVG(rating), 0) AS rating, COUNT(*) AS review_count FROM product_reviews WHERE product_id = ?',
      [productId]
    );
    const row = rows[0] as RowDataPacket;
    return { rating: Number(Number(row.rating).toFixed(1)), review_count: Number(row.review_count) };
  }
}
