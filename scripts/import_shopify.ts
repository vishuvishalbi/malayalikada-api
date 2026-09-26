// Imports a Shopify products export directly via ShopifyCsvImportService (no API/auth needed).
// Usage: node -r tsx/cjs scripts/import_shopify.ts <csv> --store <id> [--force-active] [--admin admin@malayalikada.com]
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { csvCell } from '../src/shared/csv';
import { db } from '../src/infrastructure/database/connection';
import { ShopifyCsvImportService, UNCATEGORIZED } from '../src/application/products/ShopifyCsvImportService';
import { parseShopifyCsv } from '../src/infrastructure/csv/ShopifyCsvParser';
import { resolveBrandId, recountCategories } from '../src/infrastructure/products/productWriteHelpers';

const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const storeId = Number(opt('--store'));
const adminIdent = opt('--admin') ?? 'admin@malayalikada.com';
if (!csvPath || !storeId) { console.error('usage: import_shopify.ts <csv> --store <id> [--force-active]'); process.exit(1); }

// Remote MySQL drops a connection held open for one multi-thousand-row transaction,
// so the CSV is imported in chunks, each its own transaction / import log.
const CHUNK = Number(opt('--chunk') ?? 40);
const PARALLEL = Number(opt('--parallel') ?? 4);
const RETRIES = 3;

function toCsv(headers: string[], recs: Record<string, string>[]): Buffer {
  const lines = [headers, ...recs.map(r => headers.map(h => r[h] ?? ''))].map(row => row.map(csvCell).join(','));
  return Buffer.from(lines.join('\n'));
}

async function main() {
  const recs = parse(readFileSync(csvPath!), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const headers = Object.keys(recs[0] ?? {});
  if (args.includes('--force-active')) for (const r of recs) if ('Status' in r) r.Status = 'active';

  const [rows] = await db.query('SELECT id FROM staff_users WHERE identifier = ? LIMIT 1', [adminIdent]);
  const staffId = (rows as any[])[0]?.id;
  if (!staffId) throw new Error(`staff user ${adminIdent} not found`);

  // Pre-create categories and brands once, so parallel chunks only ever look them up
  // (avoids duplicate categories / unique-brand races between transactions).
  const parsed = parseShopifyCsv(toCsv(headers, recs)).rows;
  const catNames = new Set(parsed.map(r => (r.categoryPath.split('>').pop()?.trim() ?? '') || UNCATEGORIZED));
  const vendors = new Set(parsed.map(r => r.vendor).filter((v): v is string => !!v));
  const conn = await db.getConnection();
  try {
    for (const n of catNames) {
      const [ex] = await conn.query('SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL LIMIT 1', [n]);
      if ((ex as any[]).length === 0) await conn.query('INSERT INTO categories (name) VALUES (?)', [n]);
    }
    for (const v of vendors) await resolveBrandId(conn, v);
  } finally { conn.release(); }
  console.log(`pre-seeded ${catNames.size} categories, ${vendors.size} brands`);

  const svc = new ShopifyCsvImportService();
  const name = csvPath!.split('/').pop()!;
  const total = { rows_total: 0, rows_ok: 0, rows_failed: 0, reports: [] as string[] };
  const chunks = Array.from({ length: Math.ceil(recs.length / CHUNK) }, (_, k) => k);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const k = next++;
      const buf = toCsv(headers, recs.slice(k * CHUNK, (k + 1) * CHUNK));
      for (let attempt = 1; ; attempt++) {
        const t0 = Date.now();
        try {
          const log = await svc.importProducts(buf, `${name}#${k + 1}`, storeId, staffId, undefined, { skipRecount: true });
          total.rows_total += log.rows_total; total.rows_ok += log.rows_ok; total.rows_failed += log.rows_failed;
          if (log.error_report_filename) total.reports.push(log.error_report_filename);
          console.log(`chunk ${k + 1}/${chunks.length}: ok=${log.rows_ok} failed=${log.rows_failed} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
          break;
        } catch (e: any) {
          console.log(`chunk ${k + 1} attempt ${attempt} failed: ${e.message}`);
          if (attempt >= RETRIES) { total.rows_failed += Math.min(CHUNK, recs.length - k * CHUNK); break; }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const [cats] = await db.query('SELECT id FROM categories WHERE deleted_at IS NULL');
  await recountCategories(db, (cats as any[]).map(c => c.id));
  console.log('recounted categories');
  console.log(JSON.stringify(total, null, 2));
}
main().then(() => db.end()).catch(e => { console.error(e); process.exit(1); });
