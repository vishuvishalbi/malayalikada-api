import { CsvParser } from '../../infrastructure/csv/CsvParser';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { db } from '../../infrastructure/database/connection';
import { RowDataPacket } from 'mysql2/promise';

export class CsvImportService {
  private parser = new CsvParser();
  private logs = new CsvImportLogRepository();
  private storage = new LocalFileStorage();

  async importFile(buffer: Buffer, filename: string, staffId: number) {
    const { rows, errors } = this.parser.parse(buffer);

    let rowsOk = 0;
    const rowErrors = [...errors];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;
      try {
        const [existing] = await db.query<RowDataPacket[]>(
          'SELECT id FROM products WHERE barcode = ?', [row.barcode]
        );
        const weight = row.weight ? parseFloat(row.weight) : null;
        const categoryId = parseInt(row.category_id);
        if (isNaN(categoryId)) throw new Error('Invalid category_id');

        if ((existing as any[]).length > 0) {
          await db.query(
            'UPDATE products SET name=?, description=?, category_id=?, brand=?, unit=?, weight=?, supplier=?, updated_at=NOW() WHERE barcode=?',
            [row.name, row.description ?? null, categoryId, row.brand ?? null, row.unit ?? null, weight, row.supplier ?? null, row.barcode]
          );
        } else {
          await db.query(
            'INSERT INTO products (barcode, name, description, category_id, brand, unit, weight, supplier, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [row.barcode, row.name, row.description ?? null, categoryId, row.brand ?? null, row.unit ?? null, weight, row.supplier ?? null]
          );
        }
        rowsOk++;
      } catch (e: any) {
        rowErrors.push({ line: lineNum, error: e.message });
      }
    }

    const rowsFailed = rowErrors.length;
    let errorReportFilename: string | null = null;

    if (rowErrors.length > 0) {
      const csvContent = 'line,error\n' + rowErrors.map(e => `${e.line},"${e.error.replace(/"/g, '""')}"`).join('\n');
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
