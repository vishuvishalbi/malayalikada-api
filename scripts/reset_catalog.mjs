// Wipes catalog + transactional data, keeps customers, staff, stores, banners, delivery_slabs, app_settings.
// Usage: node scripts/reset_catalog.mjs --yes
import 'dotenv/config';
import mysql from 'mysql2/promise';

const TABLES = [
  'payment_attempts', 'transactions', 'order_items', 'orders', 'order_daily_sequences',
  'cart_items', 'carts', 'favorites', 'product_reviews', 'notify_requests', 'item_requests',
  'csv_import_logs', 'product_images', 'product_stock', 'store_pricing', 'product_categories',
  'products', 'categories', 'brands',
];

if (!process.argv.includes('--yes')) {
  console.error(`Would TRUNCATE on ${process.env.DB_HOST}/${process.env.DB_NAME}:\n  ${TABLES.join(', ')}\nRe-run with --yes to execute.`);
  process.exit(1);
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
await conn.query('SET FOREIGN_KEY_CHECKS=0');
for (const t of TABLES) { await conn.query(`TRUNCATE TABLE \`${t}\``); console.log('truncated', t); }
await conn.query('SET FOREIGN_KEY_CHECKS=1');
await conn.end();
