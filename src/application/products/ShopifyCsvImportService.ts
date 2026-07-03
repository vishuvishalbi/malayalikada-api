import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../../infrastructure/database/connection';
import { parseShopifyCsv } from '../../infrastructure/csv/ShopifyCsvParser';
import { parseShopifyInventoryCsv } from '../../infrastructure/csv/ShopifyInventoryCsvParser';
import { CsvImportLogRepository } from '../../infrastructure/repositories/CsvImportLogRepository';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { ICsvImportLog } from '../../domain/entities/CsvImportLog';

export class ShopifyCsvImportService {
  private logs = new CsvImportLogRepository();
  private storage = new LocalFileStorage();

  async importProducts(
    productBuffer: Buffer,
    productFilename: string,
    storeId: number,
    staffId: number,
    inventoryBuffer?: Buffer,
  ): Promise<ICsvImportLog> {
    const { rows, errors } = parseShopifyCsv(productBuffer);
    const rowErrors = [...errors];

    const inventoryMap = inventoryBuffer
      ? parseShopifyInventoryCsv(inventoryBuffer)
      : null;

    let rowsOk = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;
      try {
        // 1. Category: derive short name from last '>' segment
        const shortName = row.categoryPath
          ? row.categoryPath.split('>').pop()!.trim() || 'Uncategorized'
          : 'Uncategorized';

        const [catRows] = await db.query<RowDataPacket[]>(
          'SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL LIMIT 1',
          [shortName],
        );
        let categoryId: number;
        if (catRows.length > 0) {
          categoryId = (catRows[0] as RowDataPacket).id as number;
        } else {
          const [catResult] = await db.query<ResultSetHeader>(
            'INSERT INTO categories (name) VALUES (?)',
            [shortName],
          );
          categoryId = catResult.insertId;
        }

        // 2. Upsert product by barcode
        const isActive = row.status === 'active' ? 1 : 0;
        const [existing] = await db.query<RowDataPacket[]>(
          'SELECT id FROM products WHERE barcode = ? AND deleted_at IS NULL',
          [row.barcode],
        );

        let productId: number;
        if ((existing as RowDataPacket[]).length > 0) {
          productId = (existing as RowDataPacket[])[0].id as number;
          await db.query(
            `UPDATE products
             SET name = ?, brand = ?, weight = ?, category_id = ?, is_active = ?, updated_at = NOW()
             WHERE id = ?`,
            [row.name, row.vendor, row.weight, categoryId, isActive, productId],
          );
        } else {
          const [result] = await db.query<ResultSetHeader>(
            `INSERT INTO products (barcode, name, brand, weight, category_id, is_active, description, unit, supplier, is_featured)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0)`,
            [row.barcode, row.name, row.vendor, row.weight, categoryId, isActive],
          );
          productId = result.insertId;
        }

        // 3. Upsert store_pricing
        await db.query(
          `INSERT INTO store_pricing (product_id, store_id, price_nzd, cost_nzd, effective_date)
           VALUES (?, ?, ?, ?, CURDATE())
           ON DUPLICATE KEY UPDATE price_nzd = VALUES(price_nzd), cost_nzd = VALUES(cost_nzd), effective_date = VALUES(effective_date)`,
          [productId, storeId, row.price, row.costPerItem ?? null],
        );

        // 4. Upsert image by (product_id, url) — skip if already exists
        if (row.imageUrl) {
          const [imgExists] = await db.query<RowDataPacket[]>(
            'SELECT id FROM product_images WHERE product_id = ? AND url = ? LIMIT 1',
            [productId, row.imageUrl],
          );
          if ((imgExists as RowDataPacket[]).length === 0) {
            await db.query(
              `INSERT INTO product_images (product_id, filename, path, url, sort_order)
               VALUES (?, '', NULL, ?, 0)`,
              [productId, row.imageUrl],
            );
          }
        }

        // 5. Upsert stock: inventory file wins, else the products CSV's own qty
        const qty = inventoryMap?.get(row.sku) ?? inventoryMap?.get(row.barcode) ?? row.inventoryQty;
        await db.query(
          `INSERT INTO product_stock (product_id, store_id, quantity)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
          [productId, storeId, qty],
        );

        rowsOk++;
      } catch (e: any) {
        rowErrors.push({ line: lineNum, error: e.message });
      }
    }

    let errorReportFilename: string | null = null;
    if (rowErrors.length > 0) {
      const csvContent =
        'line,error\n' +
        rowErrors.map((e) => `${e.line},"${e.error.replace(/"/g, '""')}"`).join('\n');
      errorReportFilename = `shopify-import-errors-${Date.now()}.csv`;
      await this.storage.save(errorReportFilename, Buffer.from(csvContent));
    }

    return this.logs.create({
      filename: productFilename,
      imported_by: staffId,
      rows_total: rowsOk + rowErrors.length,
      rows_ok: rowsOk,
      rows_failed: rowErrors.length,
      error_report_filename: errorReportFilename,
    });
  }
}
