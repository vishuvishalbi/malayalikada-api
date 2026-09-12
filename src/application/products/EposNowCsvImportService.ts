import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../../infrastructure/database/connection';
import { resolveBrandId, ensurePrimaryCategory } from '../../infrastructure/products/productWriteHelpers';
import { parseEposNowCategoryCsv, parseEposNowProductCsv } from '../../infrastructure/csv/EposNowCsvParser';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { csvCell } from '../../shared/csv';
import { ICsvImportLog } from '../../domain/entities/CsvImportLog';
import { ValidationError } from '../../shared/errors/AppError';

export const MAX_IMPORT_ROWS = 5000;

export class EposNowCsvImportService {
  private logs = new CsvImportLogRepository();
  private storage = new LocalFileStorage();

  async importCategories(
    categoryBuffer: Buffer,
    categoryFilename: string,
    staffId: number,
  ): Promise<ICsvImportLog> {
    const { rows, errors } = parseEposNowCategoryCsv(categoryBuffer);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(`Too many rows: ${rows.length} (max ${MAX_IMPORT_ROWS})`);
    }

    const rowErrors = [...errors];
    let rowsOk = 0;

    // externalId -> resolved category_id, populated in two passes so parents
    // always exist before children reference them.
    const idByExternal = new Map<string, number>();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Pass 1: upsert every category by name, ignoring parent linkage.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const [existing] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL LIMIT 1',
            [row.name],
          );
          let categoryId: number;
          if (existing.length > 0) {
            categoryId = existing[0].id as number;
          } else {
            const [result] = await conn.query<ResultSetHeader>(
              'INSERT INTO categories (name) VALUES (?)',
              [row.name],
            );
            categoryId = result.insertId;
          }
          idByExternal.set(row.externalId, categoryId);
          rowsOk++;
        } catch (e: any) {
          rowErrors.push({ line: i + 2, error: e.message });
        }
      }

      // Pass 2: wire up parent_id now that every category in this file has an id.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.parentExternalId) continue;
        const categoryId = idByExternal.get(row.externalId);
        const parentId = idByExternal.get(row.parentExternalId);
        if (!categoryId || !parentId || parentId === categoryId) continue;
        await conn.query('UPDATE categories SET parent_id = ? WHERE id = ?', [parentId, categoryId]);
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return this.writeLog(categoryFilename, staffId, rowsOk, rowErrors, 'eposnow-category-import-errors');
  }

  async importProducts(
    productBuffer: Buffer,
    productFilename: string,
    storeId: number,
    staffId: number,
  ): Promise<ICsvImportLog> {
    const { rows, errors } = parseEposNowProductCsv(productBuffer);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(`Too many rows: ${rows.length} (max ${MAX_IMPORT_ROWS})`);
    }

    const rowErrors = [...errors];
    let rowsOk = 0;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNum = i + 2;
        try {
          // 1. Category: resolve by exact name, creating it if unseen.
          const [catRows] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL LIMIT 1',
            [row.categoryName],
          );
          let categoryId: number;
          if (catRows.length > 0) {
            categoryId = catRows[0].id as number;
          } else {
            const [catResult] = await conn.query<ResultSetHeader>(
              'INSERT INTO categories (name) VALUES (?)',
              [row.categoryName],
            );
            categoryId = catResult.insertId;
          }

          // 2. Upsert product by barcode
          const [existing] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM products WHERE barcode = ? AND deleted_at IS NULL',
            [row.barcode],
          );

          const brandId = await resolveBrandId(conn, row.brand);
          const brandName = brandId ? String(row.brand).trim() : null;
          let productId: number;
          if (existing.length > 0) {
            productId = existing[0].id as number;
            await conn.query(
              `UPDATE products
               SET name = ?, description = ?, brand = ?, brand_id = ?, weight = ?, category_id = ?, is_active = ?, updated_at = NOW()
               WHERE id = ?`,
              [row.name, row.description, brandName, brandId, row.weight, categoryId, row.isSellOnTill ? 1 : 0, productId],
            );
          } else {
            const [result] = await conn.query<ResultSetHeader>(
              `INSERT INTO products (barcode, name, description, brand, brand_id, weight, category_id, is_active, unit, supplier, is_featured)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
              [row.barcode, row.name, row.description, brandName, brandId, row.weight, categoryId, row.isSellOnTill ? 1 : 0],
            );
            productId = result.insertId;
          }
          await ensurePrimaryCategory(conn, productId, categoryId);

          // 3. Upsert store_pricing
          await conn.query(
            `INSERT INTO store_pricing (product_id, store_id, price_nzd, cost_nzd, effective_date)
             VALUES (?, ?, ?, ?, CURDATE())
             ON DUPLICATE KEY UPDATE price_nzd = VALUES(price_nzd), cost_nzd = VALUES(cost_nzd), effective_date = VALUES(effective_date)`,
            [productId, storeId, row.sellingPrice, row.costPrice],
          );

          rowsOk++;
        } catch (e: any) {
          rowErrors.push({ line: lineNum, error: e.message });
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return this.writeLog(productFilename, staffId, rowsOk, rowErrors, 'eposnow-product-import-errors');
  }

  private async writeLog(
    filename: string,
    staffId: number,
    rowsOk: number,
    rowErrors: Array<{ line: number; error: string }>,
    errorReportPrefix: string,
  ): Promise<ICsvImportLog> {
    let errorReportFilename: string | null = null;
    if (rowErrors.length > 0) {
      const csvContent =
        'line,error\n' +
        rowErrors.map((e) => `${e.line},${csvCell(e.error)}`).join('\n');
      errorReportFilename = `${errorReportPrefix}-${Date.now()}.csv`;
      await this.storage.save(errorReportFilename, Buffer.from(csvContent));
    }

    return this.logs.create({
      filename,
      imported_by: staffId,
      rows_total: rowsOk + rowErrors.length,
      rows_ok: rowsOk,
      rows_failed: rowErrors.length,
      error_report_filename: errorReportFilename,
    });
  }
}
