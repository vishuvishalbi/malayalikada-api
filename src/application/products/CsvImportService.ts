import { CsvParser } from '../../infrastructure/csv/CsvParser';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { csvCell } from '../../shared/csv';
import { db } from '../../infrastructure/database/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { resolveBrandId, ensurePrimaryCategory } from '../../infrastructure/products/productWriteHelpers';
import { ValidationError } from '../../shared/errors/AppError';

export const MAX_IMPORT_ROWS = 5000;

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
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNum = i + 2;
        try {
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
            await conn.query(
              'UPDATE products SET name=?, description=?, category_id=?, brand=?, brand_id=?, unit=?, weight=?, supplier=?, updated_at=NOW() WHERE id=?',
              [row.name, row.description ?? null, categoryId, brandName, brandId, row.unit ?? null, weight, row.supplier ?? null, productId]
            );
          } else {
            const [ins] = await conn.query<ResultSetHeader>(
              'INSERT INTO products (barcode, name, description, category_id, brand, brand_id, unit, weight, supplier, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
              [row.barcode, row.name, row.description ?? null, categoryId, brandName, brandId, row.unit ?? null, weight, row.supplier ?? null]
            );
            productId = ins.insertId;
          }
          await ensurePrimaryCategory(conn, productId, categoryId);
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
}
