import path from 'path';
import { CsvParser, CsvProductRow } from '../../infrastructure/csv/CsvParser';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { csvCell } from '../../shared/csv';
import { db } from '../../infrastructure/database/connection';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { resolveBrandId, ensurePrimaryCategory, recountCategories, categoryIdsForProduct } from '../../infrastructure/products/productWriteHelpers';
import { ValidationError } from '../../shared/errors/AppError';

export const MAX_IMPORT_ROWS = 5000;
const MAX_IMAGES = 5;
const BOOLS: Record<string, boolean> = { true: true, '1': true, yes: true, false: false, '0': false, no: false };

/** Optional export-format columns, validated before any write. Blank cell = leave unchanged. */
export function parseOptionalColumns(row: CsvProductRow, storeIds: Set<number>) {
  const bool = (col: 'is_active' | 'is_featured') => {
    const v = row[col]?.toLowerCase();
    if (!v) return undefined;
    if (!(v in BOOLS)) throw new Error(`Invalid ${col}: ${row[col]}`);
    return BOOLS[v];
  };
  const num = (col: 'store_id' | 'price_nzd' | 'cost_nzd' | 'stock_quantity', integer: boolean) => {
    const v = row[col];
    if (!v) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${col}: ${v}`);
    return n;
  };
  const values = {
    isActive: bool('is_active'),
    isFeatured: bool('is_featured'),
    storeId: num('store_id', true),
    price: num('price_nzd', false),
    cost: num('cost_nzd', false),
    stock: num('stock_quantity', true),
    imageUrls: (row.image_urls ?? '').split('|').map(u => u.trim()).filter(Boolean),
  };
  const hasStoreValues = values.price !== undefined || values.cost !== undefined || values.stock !== undefined;
  if (hasStoreValues && values.storeId === undefined) throw new Error('store_id is required to set price_nzd, cost_nzd or stock_quantity');
  if (values.storeId !== undefined && !storeIds.has(values.storeId)) throw new Error(`Unknown store_id: ${values.storeId}`);
  return values;
}

/** Matches an image by file name, so an exported public URL finds the stored filename/url it came from. */
const imageKey = (urlOrFilename: string) => path.posix.basename(urlOrFilename.split(/[?#]/)[0]);
type ImageState = { keys: Set<string>; count: number };

export class CsvImportService {
  private parser = new CsvParser();
  private logs = new CsvImportLogRepository();
  private storage = new LocalFileStorage();

  async importFile(buffer: Buffer, filename: string, staffId: number) {
    const { rows, errors } = this.parser.parse(buffer);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(`Too many rows: ${rows.length} (max ${MAX_IMPORT_ROWS})`);
    }

    let rowsOk = 0;
    const rowErrors = [...errors];
    const touchedCategories = new Set<number>();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [storeRows] = await conn.query<RowDataPacket[]>('SELECT id FROM stores');
      const storeIds = new Set(storeRows.map(r => r.id as number));
      const images = await this.loadImages(conn, rows);
      for (const row of rows) {
        try {
          // Per-row savepoint: a failing row is skipped whole, never half-written.
          await conn.query('SAVEPOINT csv_row');
          const opt = parseOptionalColumns(row, storeIds);
          const [existing] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM products WHERE barcode = ? AND deleted_at IS NULL', [row.barcode]
          );
          const weight = row.weight ? parseFloat(row.weight) : null;
          const categoryId = parseInt(row.category_id);
          if (isNaN(categoryId)) throw new Error('Invalid category_id');

          const brandId = await resolveBrandId(conn, row.brand);
          const brandName = brandId ? row.brand!.trim() : null;
          let productId: number;
          if ((existing as any[]).length > 0) {
            productId = (existing as any[])[0].id as number;
            // An upsert may move the product between categories — the one it
            // leaves needs recounting as much as the one it joins.
            for (const id of await categoryIdsForProduct(conn, productId)) touchedCategories.add(id);
            await conn.query(
              'UPDATE products SET name=?, description=?, category_id=?, brand=?, brand_id=?, unit=?, weight=?, supplier=?, is_active=COALESCE(?, is_active), is_featured=COALESCE(?, is_featured), updated_at=NOW() WHERE id=?',
              [row.name, row.description ?? null, categoryId, brandName, brandId, row.unit ?? null, weight, row.supplier ?? null, opt.isActive ?? null, opt.isFeatured ?? null, productId]
            );
          } else {
            const [ins] = await conn.query<ResultSetHeader>(
              'INSERT INTO products (barcode, name, description, category_id, brand, brand_id, unit, weight, supplier, is_active, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [row.barcode, row.name, row.description ?? null, categoryId, brandName, brandId, row.unit ?? null, weight, row.supplier ?? null, opt.isActive ?? true, opt.isFeatured ?? false]
            );
            productId = ins.insertId;
          }
          await ensurePrimaryCategory(conn, productId, categoryId);
          touchedCategories.add(categoryId);
          if (opt.storeId !== undefined) await this.writeStoreValues(conn, productId, opt.storeId, opt);
          if (opt.imageUrls.length > 0) await this.addMissingImages(conn, productId, opt.imageUrls, images, row.barcode);
          rowsOk++;
        } catch (e: any) {
          await conn.query('ROLLBACK TO SAVEPOINT csv_row');
          rowErrors.push({ line: row.line, error: e.message });
        }
      }
      // One recount for the whole import rather than per row.
      await recountCategories(conn, [...touchedCategories]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const rowsFailed = rowErrors.length;
    let errorReportFilename: string | null = null;

    if (rowErrors.length > 0) {
      const csvContent = 'line,error\n' + rowErrors.map(e => `${e.line},${csvCell(e.error)}`).join('\n');
      errorReportFilename = `import-errors-${Date.now()}.csv`;
      await this.storage.save(errorReportFilename, Buffer.from(csvContent));
    }

    return this.logs.create({
      filename,
      imported_by: staffId,
      rows_total: rows.length + errors.length,
      rows_ok: rowsOk,
      rows_failed: rowsFailed,
      error_report_filename: errorReportFilename,
    });
  }

  /**
   * Price/cost/stock for one store. Blank cells leave values unchanged; cost
   * survives a blank (COALESCE), and effective_date only moves when price does.
   */
  private async writeStoreValues(
    conn: PoolConnection, productId: number, storeId: number,
    v: { price?: number; cost?: number; stock?: number },
  ) {
    if (v.price !== undefined) {
      await conn.query(
        `INSERT INTO store_pricing (product_id, store_id, price_nzd, cost_nzd, effective_date)
         VALUES (?, ?, ?, ?, CURDATE())
         ON DUPLICATE KEY UPDATE effective_date = IF(price_nzd <=> VALUES(price_nzd), effective_date, VALUES(effective_date)),
                                 price_nzd = VALUES(price_nzd),
                                 cost_nzd = COALESCE(VALUES(cost_nzd), cost_nzd),
                                 updated_at = NOW()`,
        [productId, storeId, v.price, v.cost ?? null],
      );
    } else if (v.cost !== undefined) {
      const [res] = await conn.query<ResultSetHeader>(
        'UPDATE store_pricing SET cost_nzd = ?, updated_at = NOW() WHERE product_id = ? AND store_id = ?',
        [v.cost, productId, storeId],
      );
      if (res.affectedRows === 0) throw new Error('cost_nzd needs price_nzd: product has no price in this store');
    }
    if (v.stock !== undefined) {
      // Absolute set, same as PUT /stock — the uploaded count is the new truth.
      await conn.query(
        `INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
        [productId, storeId, v.stock],
      );
    }
  }

  /** Existing images for every imported barcode that lists image_urls — one query, not per row. */
  private async loadImages(conn: PoolConnection, rows: CsvProductRow[]): Promise<Map<string, ImageState>> {
    const images = new Map<string, ImageState>();
    const barcodes = rows.filter(r => r.image_urls).map(r => r.barcode);
    if (barcodes.length === 0) return images;
    const [imgRows] = await conn.query<RowDataPacket[]>(
      `SELECT p.barcode, pi.filename, pi.url FROM product_images pi
       INNER JOIN products p ON p.id = pi.product_id AND p.deleted_at IS NULL
       WHERE p.barcode IN (?)`,
      [barcodes],
    );
    for (const r of imgRows) {
      const state = images.get(r.barcode) ?? { keys: new Set<string>(), count: 0 };
      for (const f of [r.filename, r.url]) if (f) state.keys.add(imageKey(f));
      state.count++;
      images.set(r.barcode, state);
    }
    return images;
  }

  /** Add-only: URLs already on the product are skipped; nothing is ever removed or reordered. */
  private async addMissingImages(conn: PoolConnection, productId: number, urls: string[], images: Map<string, ImageState>, barcode: string) {
    const state = images.get(barcode) ?? { keys: new Set<string>(), count: 0 };
    images.set(barcode, state);
    for (const url of urls) {
      if (state.count >= MAX_IMAGES) break;
      if (state.keys.has(imageKey(url)) || !/^https?:\/\//i.test(url)) continue;
      await conn.query(
        `INSERT INTO product_images (product_id, filename, path, url, sort_order) VALUES (?, '', NULL, ?, ?)`,
        [productId, url, state.count],
      );
      state.keys.add(imageKey(url));
      state.count++;
    }
  }
}
