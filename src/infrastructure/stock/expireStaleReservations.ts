import { RowDataPacket } from 'mysql2/promise';

const RESERVATION_TTL_MINUTES = 15;

export async function expireStaleReservations(conn: any, productId: number, storeId: number): Promise<void> {
  const [staleCartItems] = await conn.query<RowDataPacket[]>(
    `SELECT id, quantity FROM cart_items
     WHERE product_id = ? AND store_id = ? AND reserved_at < DATE_SUB(NOW(), INTERVAL ${RESERVATION_TTL_MINUTES} MINUTE)`,
    [productId, storeId]
  );
  for (const row of staleCartItems as any[]) {
    await conn.query(
      'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
      [row.quantity, productId, storeId]
    );
    await conn.query('DELETE FROM cart_items WHERE id = ?', [row.id]);
  }

  const [staleOrderItems] = await conn.query<RowDataPacket[]>(
    `SELECT oi.id, oi.order_id, oi.quantity FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = ? AND o.store_id = ? AND o.status = 'pending_approval' AND o.payment_status = 'unpaid'
       AND oi.reserved_at < DATE_SUB(NOW(), INTERVAL ${RESERVATION_TTL_MINUTES} MINUTE)`,
    [productId, storeId]
  );
  const seenOrders = new Set<number>();
  for (const row of staleOrderItems as any[]) {
    await conn.query(
      'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
      [row.quantity, productId, storeId]
    );
    if (!seenOrders.has(row.order_id)) {
      seenOrders.add(row.order_id);
      await conn.query("UPDATE orders SET status = 'expired', updated_at = NOW() WHERE id = ?", [row.order_id]);
    }
  }
}
