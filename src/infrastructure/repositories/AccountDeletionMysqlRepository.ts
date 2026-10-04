import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { ANONYMIZED_NAME, anonymizedIdentifier } from '../../domain/entities/Customer';
import { IAccountDeletionRepository } from '../../domain/repositories/IAccountDeletionRepository';

// Mirrors OrderMysqlRepository.expireAbandonedUnpaid: orders still holding stock that nobody has paid for.
const UNPAID_PENDING_ORDERS = `o.customer_id = ? AND o.status = 'pending_approval' AND o.payment_status = 'unpaid'
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.order_id = o.id AND t.status = 'succeeded')`;

export class AccountDeletionMysqlRepository implements IAccountDeletionRepository {
  async anonymizeCustomer(customerId: number): Promise<boolean> {
    // Random, well-formed and never disclosed, so no password can ever match. Hashed before the transaction opens.
    const unusablePasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 4);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT id, identifier FROM customers WHERE id = ? FOR UPDATE',
        [customerId]
      );
      const customer = rows[0];
      if (!customer || customer.identifier === anonymizedIdentifier(customerId)) {
        await conn.commit();
        return false;
      }

      // Cart: release the stock it holds (as CartMysqlRepository.clear does), then drop it.
      await conn.query(
        `UPDATE product_stock ps
         JOIN (SELECT product_id, store_id, SUM(quantity) AS qty FROM cart_items
               WHERE cart_id = ? AND reserved_at IS NOT NULL GROUP BY product_id, store_id) h
           ON h.product_id = ps.product_id AND h.store_id = ps.store_id
         SET ps.reserved_quantity = GREATEST(0, ps.reserved_quantity - h.qty)`,
        [customerId]
      );
      await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [customerId]);
      await conn.query('DELETE FROM carts WHERE customer_id = ?', [customerId]);

      // Unpaid pending orders: release their held stock, then expire them. Paid in-flight orders stay for staff to action.
      await conn.query(
        `UPDATE product_stock ps
         JOIN (SELECT oi.product_id, o.store_id, SUM(oi.quantity) AS qty
               FROM order_items oi JOIN orders o ON o.id = oi.order_id
               WHERE ${UNPAID_PENDING_ORDERS}
               GROUP BY oi.product_id, o.store_id) h
           ON h.product_id = ps.product_id AND h.store_id = ps.store_id
         SET ps.reserved_quantity = GREATEST(0, ps.reserved_quantity - h.qty)`,
        [customerId]
      );
      await conn.query(
        `UPDATE orders o SET o.status = 'expired', o.updated_at = NOW() WHERE ${UNPAID_PENDING_ORDERS}`,
        [customerId]
      );

      // Personal content. Favorites, orders and ratings are deliberately kept: they carry no personal data once the customer row below is anonymized.
      await conn.query('DELETE FROM notify_requests WHERE customer_id = ?', [customerId]);
      await conn.query('UPDATE product_reviews SET comment = NULL WHERE customer_id = ?', [customerId]);
      await conn.query('UPDATE item_requests SET notes = NULL WHERE customer_id = ?', [customerId]);

      // Revoke every session.
      await conn.query("DELETE FROM auth_tokens WHERE user_type = 'customer' AND user_id = ?", [customerId]);

      await conn.query(
        `UPDATE customers SET identifier = ?, first_name = ?, last_name = ?, password_hash = ?,
           email = NULL, phone_number = NULL, phone = NULL, address = NULL, updated_at = NOW()
         WHERE id = ?`,
        [anonymizedIdentifier(customerId), ANONYMIZED_NAME.first_name, ANONYMIZED_NAME.last_name, unusablePasswordHash, customerId]
      );

      await conn.commit();
      return true;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}
