import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { ICart } from '../../domain/entities/Cart';
import { ICartItem } from '../../domain/entities/CartItem';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { ValidationError } from '../../shared/errors/AppError';
import { expireStaleReservations } from '../stock/expireStaleReservations';

export class CartMysqlRepository implements ICartRepository {
  async findByCustomer(customerId: number): Promise<ICart | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT customer_id, store_id, updated_at FROM carts WHERE customer_id = ?',
      [customerId]
    );
    if (!rows[0]) return null;
    return rows[0] as unknown as ICart;
  }

  async findItems(customerId: number): Promise<ICartItem[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM cart_items WHERE cart_id = ?',
      [customerId]
    );
    return rows as unknown as ICartItem[];
  }

  async expireAndFindItems(customerId: number): Promise<ICartItem[]> {
    const current = await this.findItems(customerId);
    const seen = new Set<string>();
    for (const item of current) {
      const key = `${item.product_id}:${item.store_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, item.store_id]);
        await expireStaleReservations(conn, item.product_id, item.store_id);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
    return this.findItems(customerId);
  }

  async reserveItem(customerId: number, storeId: number, productId: number, quantity: number): Promise<ICartItem> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO carts (customer_id, store_id, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), updated_at = NOW()`,
        [customerId, storeId]
      );

      await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [productId, storeId]);
      await expireStaleReservations(conn, productId, storeId);

      const [stockRows] = await conn.query<RowDataPacket[]>(
        'SELECT quantity, reserved_quantity, max_reserve_qty FROM product_stock WHERE product_id = ? AND store_id = ?',
        [productId, storeId]
      );
      const stock = (stockRows as any[])[0];
      if (!stock) throw new ValidationError('Product not available at selected store');

      const [priceRows] = await conn.query<RowDataPacket[]>(
        'SELECT price_nzd FROM store_pricing WHERE product_id = ? AND store_id = ?',
        [productId, storeId]
      );
      if ((priceRows as any[]).length === 0) throw new ValidationError('Product not available at selected store');

      const [existingRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [customerId, productId]
      );
      const existing = (existingRows as any[])[0] as ICartItem | undefined;
      const previousQuantity = existing?.quantity ?? 0;
      const delta = quantity - previousQuantity;

      if (quantity > stock.max_reserve_qty) {
        throw new ValidationError(`Cannot exceed maximum quantity (${stock.max_reserve_qty}) for this item`);
      }
      if (delta > 0 && (stock.quantity - stock.reserved_quantity) < delta) {
        throw new ValidationError('Insufficient stock');
      }

      if (existing) {
        await conn.query(
          'UPDATE cart_items SET quantity = ?, reserved_at = NOW(), updated_at = NOW() WHERE id = ?',
          [quantity, existing.id]
        );
      } else {
        await conn.query(
          'INSERT INTO cart_items (cart_id, product_id, store_id, quantity, reserved_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())',
          [customerId, productId, storeId, quantity]
        );
      }

      if (delta !== 0) {
        await conn.query(
          'UPDATE product_stock SET reserved_quantity = reserved_quantity + ? WHERE product_id = ? AND store_id = ?',
          [delta, productId, storeId]
        );
      }

      await conn.commit();

      const [resultRows] = await db.query<RowDataPacket[]>(
        'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [customerId, productId]
      );
      return (resultRows as any[])[0] as ICartItem;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async releaseItem(customerId: number, productId: number): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [customerId, productId]
      );
      const item = (rows as any[])[0] as ICartItem | undefined;
      if (!item) {
        await conn.commit();
        return;
      }

      await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, item.store_id]);
      await conn.query(
        'UPDATE product_stock SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE product_id = ? AND store_id = ?',
        [item.quantity, item.product_id, item.store_id]
      );
      await conn.query('DELETE FROM cart_items WHERE id = ?', [item.id]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async clear(customerId: number): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [items] = await conn.query<RowDataPacket[]>('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY product_id, store_id', [customerId]);
      for (const item of items as any[]) {
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, item.store_id]);
        await conn.query(
          'UPDATE product_stock SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE product_id = ? AND store_id = ?',
          [item.quantity, item.product_id, item.store_id]
        );
      }
      await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [customerId]);
      await conn.query('DELETE FROM carts WHERE customer_id = ?', [customerId]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}
