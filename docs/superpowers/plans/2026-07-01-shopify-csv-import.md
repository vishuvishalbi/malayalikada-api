# Shopify CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /api/v1/products/import/shopify-csv` endpoint that accepts a Shopify product export CSV, auto-creates categories, upserts products with pricing, and optionally accepts an inventory CSV to set stock quantities — all scoped to a specific store.

**Architecture:** A dedicated `ShopifyCsvImportService` handles the two-file import (products + optional inventory). It auto-creates missing categories by deriving a short name from the Shopify category path, upserts products and store_pricing rows, and optionally upserts product_stock rows. Reuses `CsvImportLogRepository` for audit logging.

**Tech Stack:** Fastify v5, TypeScript, Knex/MySQL2, csv-parse, existing `LocalFileStorage` for error reports.

## Global Constraints

- Follow existing layer rules: domain entities → application services → infrastructure repos → presentation controllers/routes
- Use `async hasTable` + `createTable` pattern for any new migrations (not `createTableIfNotExists`)
- Use `z.toJSONSchema()` from Zod v4 (not `zod-to-json-schema`) for swagger schema generation
- All routes prefixed `/api/v1`, authenticated with `authenticate` + `requireRole('admin')`
- Barcode fallback: if `Variant Barcode` is empty, use `Variant SKU`; skip row if both empty
- Category derived from last segment of `Product Category` path (e.g. `"Food > Snack Foods"` → `"Snack Foods"`); if blank → `"Uncategorized"`
- Weight stored in grams (CSV column `Variant Grams` is already in grams)
- Price stored as `price_nzd` in `store_pricing` table linked to the target store
- Stock stored in `product_stock` table; negative values from inventory CSV treated as 0
- Image URL stored directly in `product_images.url` column (no local download)
- Reuse `CsvImportLogRepository` for import audit log

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/infrastructure/csv/ShopifyCsvParser.ts` | Parse + validate Shopify product CSV rows |
| Create | `src/infrastructure/csv/ShopifyInventoryCsvParser.ts` | Parse Shopify inventory CSV rows |
| Create | `src/application/products/ShopifyCsvImportService.ts` | Orchestrate upsert: categories → products → pricing → stock → images |
| Modify | `src/presentation/routes/product.routes.ts` | Add new `POST /products/import/shopify-csv` route |

---

## Task 1: ShopifyCsvParser

**Files:**
- Create: `src/infrastructure/csv/ShopifyCsvParser.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ShopifyProductRow {
    handle: string;
    name: string;
    vendor: string | null;
    categoryPath: string;   // raw "Food > Snack Foods" — caller derives short name
    barcode: string;        // Variant Barcode fallback to Variant SKU
    price: number;          // Variant Price parsed as float
    weight: number | null;  // Variant Grams parsed as float, null if empty
    imageUrl: string | null;// Image Src, null if empty
    status: string;         // "active" | "draft" | "archived"
  }
  export interface ShopifyParseResult {
    rows: ShopifyProductRow[];
    errors: Array<{ line: number; error: string }>;
  }
  export function parseShopifyCsv(buffer: Buffer): ShopifyParseResult
  ```

- [ ] **Step 1: Create `src/infrastructure/csv/ShopifyCsvParser.ts`**

```ts
import { parse } from 'csv-parse/sync';

export interface ShopifyProductRow {
  handle: string;
  name: string;
  vendor: string | null;
  categoryPath: string;
  barcode: string;
  price: number;
  weight: number | null;
  imageUrl: string | null;
  status: string;
}

export interface ShopifyParseResult {
  rows: ShopifyProductRow[];
  errors: Array<{ line: number; error: string }>;
}

export function parseShopifyCsv(buffer: Buffer): ShopifyParseResult {
  const rows: ShopifyProductRow[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  let records: unknown[];
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    return { rows: [], errors: [{ line: 0, error: `Parse error: ${e.message}` }] };
  }

  (records as any[]).forEach((rec, i) => {
    const lineNum = i + 2;

    const barcode = (rec['Variant Barcode'] || rec['Variant SKU'] || '').trim();
    if (!barcode) {
      errors.push({ line: lineNum, error: `Row skipped: no barcode or SKU for "${rec['Handle']}"` });
      return;
    }

    const name = (rec['Title'] || '').trim();
    if (!name) {
      errors.push({ line: lineNum, error: `Row skipped: missing Title` });
      return;
    }

    const price = parseFloat(rec['Variant Price'] || '0');
    if (isNaN(price)) {
      errors.push({ line: lineNum, error: `Row skipped: invalid Variant Price "${rec['Variant Price']}"` });
      return;
    }

    const rawWeight = (rec['Variant Grams'] || '').trim();
    const weight = rawWeight ? parseFloat(rawWeight) : null;

    rows.push({
      handle: rec['Handle'] || '',
      name,
      vendor: (rec['Vendor'] || '').trim() || null,
      categoryPath: (rec['Product Category'] || '').trim(),
      barcode,
      price,
      weight: weight !== null && !isNaN(weight) ? weight : null,
      imageUrl: (rec['Image Src'] || '').trim() || null,
      status: (rec['Status'] || 'active').trim().toLowerCase(),
    });
  });

  return { rows, errors };
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/csv/ShopifyCsvParser.ts
git commit -m "feat: add ShopifyCsvParser for Shopify product export format"
```

---

## Task 2: ShopifyInventoryCsvParser

**Files:**
- Create: `src/infrastructure/csv/ShopifyInventoryCsvParser.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ShopifyInventoryRow {
    sku: string;   // SKU column — used to match products by barcode
    quantity: number; // "On hand (new)" if present and non-empty, else "Available (not editable)"; negative → 0
  }
  export function parseShopifyInventoryCsv(buffer: Buffer): Map<string, number>
  // returns Map<sku, quantity>
  ```

- [ ] **Step 1: Create `src/infrastructure/csv/ShopifyInventoryCsvParser.ts`**

```ts
import { parse } from 'csv-parse/sync';

export function parseShopifyInventoryCsv(buffer: Buffer): Map<string, number> {
  const result = new Map<string, number>();

  let records: unknown[];
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return result;
  }

  for (const rec of records as any[]) {
    const sku = (rec['SKU'] || '').trim();
    if (!sku) continue;

    const rawNew = (rec['On hand (new)'] || '').trim();
    const rawAvail = (rec['Available (not editable)'] || '').trim();
    const raw = rawNew !== '' ? rawNew : rawAvail;
    const qty = Math.max(0, parseInt(raw || '0', 10) || 0);

    result.set(sku, qty);
  }

  return result;
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/csv/ShopifyInventoryCsvParser.ts
git commit -m "feat: add ShopifyInventoryCsvParser for Shopify inventory export format"
```

---

## Task 3: ShopifyCsvImportService

**Files:**
- Create: `src/application/products/ShopifyCsvImportService.ts`

**Interfaces:**
- Consumes:
  - `parseShopifyCsv(buffer: Buffer): ShopifyParseResult` from `src/infrastructure/csv/ShopifyCsvParser.ts`
  - `parseShopifyInventoryCsv(buffer: Buffer): Map<string, number>` from `src/infrastructure/csv/ShopifyInventoryCsvParser.ts`
  - `CsvImportLogRepository` from `src/infrastructure/repositories/CsvImportLogRepository.ts`
  - `LocalFileStorage` from `src/infrastructure/storage/LocalFileStorage.ts`
  - `db` from `src/infrastructure/database/connection.ts`
- Produces:
  ```ts
  export class ShopifyCsvImportService {
    async importProducts(
      productBuffer: Buffer,
      productFilename: string,
      storeId: number,
      staffId: number,
      inventoryBuffer?: Buffer,
    ): Promise<ICsvImportLog>
  }
  ```

**Logic per row:**
1. Derive category short name: last `>` segment of `categoryPath`, trimmed. Empty → `"Uncategorized"`.
2. Find or create category by name (`INSERT IGNORE` + SELECT).
3. Upsert product by barcode (UPDATE if exists, INSERT if not). Set `is_active = status === 'active'`.
4. Upsert `store_pricing`: `INSERT ... ON DUPLICATE KEY UPDATE price_nzd = VALUES(price_nzd)`.
5. If product has `imageUrl`, upsert `product_images` by `(product_id, url)`: skip if already exists.
6. If inventory map provided and SKU in map: upsert `product_stock` for this store.

- [ ] **Step 1: Create `src/application/products/ShopifyCsvImportService.ts`**

```ts
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
        // 1. Category: derive short name from last segment
        const shortName = row.categoryPath
          ? row.categoryPath.split('>').pop()!.trim() || 'Uncategorized'
          : 'Uncategorized';

        await db.query(
          'INSERT IGNORE INTO categories (name, is_active) VALUES (?, 1)',
          [shortName]
        );
        const [catRows] = await db.query<RowDataPacket[]>(
          'SELECT id FROM categories WHERE name = ? LIMIT 1',
          [shortName]
        );
        const categoryId = (catRows[0] as RowDataPacket).id as number;

        // 2. Upsert product
        const isActive = row.status === 'active' ? 1 : 0;
        const [existing] = await db.query<RowDataPacket[]>(
          'SELECT id FROM products WHERE barcode = ? AND deleted_at IS NULL',
          [row.barcode]
        );

        let productId: number;
        if ((existing as any[]).length > 0) {
          productId = (existing as any[])[0].id as number;
          await db.query(
            `UPDATE products
             SET name = ?, brand = ?, weight = ?, category_id = ?, is_active = ?, updated_at = NOW()
             WHERE id = ?`,
            [row.name, row.vendor, row.weight, categoryId, isActive, productId]
          );
        } else {
          const [result] = await db.query<ResultSetHeader>(
            `INSERT INTO products (barcode, name, brand, weight, category_id, is_active, description, unit, supplier, is_featured)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0)`,
            [row.barcode, row.name, row.vendor, row.weight, categoryId, isActive]
          );
          productId = result.insertId;
        }

        // 3. Upsert store_pricing
        await db.query(
          `INSERT INTO store_pricing (product_id, store_id, price_nzd, effective_date)
           VALUES (?, ?, ?, CURDATE())
           ON DUPLICATE KEY UPDATE price_nzd = VALUES(price_nzd), effective_date = VALUES(effective_date)`,
          [productId, storeId, row.price]
        );

        // 4. Upsert image (by url — skip if already recorded)
        if (row.imageUrl) {
          const [imgExists] = await db.query<RowDataPacket[]>(
            'SELECT id FROM product_images WHERE product_id = ? AND url = ? LIMIT 1',
            [productId, row.imageUrl]
          );
          if ((imgExists as any[]).length === 0) {
            const [imgCount] = await db.query<RowDataPacket[]>(
              'SELECT COUNT(*) AS cnt FROM product_images WHERE product_id = ?',
              [productId]
            );
            const sortOrder = (imgCount[0] as RowDataPacket).cnt as number;
            await db.query(
              `INSERT INTO product_images (product_id, filename, path, url, sort_order)
               VALUES (?, '', NULL, ?, ?)`,
              [productId, row.imageUrl, sortOrder]
            );
          }
        }

        // 5. Upsert stock if inventory provided
        if (inventoryMap) {
          const qty = inventoryMap.get(row.barcode) ?? 0;
          await db.query(
            `INSERT INTO product_stock (product_id, store_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
            [productId, storeId, qty]
          );
        }

        rowsOk++;
      } catch (e: any) {
        rowErrors.push({ line: lineNum, error: e.message });
      }
    }

    let errorReportFilename: string | null = null;
    if (rowErrors.length > 0) {
      const csvContent = 'line,error\n' +
        rowErrors.map(e => `${e.line},"${e.error.replace(/"/g, '""')}"`).join('\n');
      errorReportFilename = `shopify-import-errors-${Date.now()}.csv`;
      await this.storage.save(errorReportFilename, Buffer.from(csvContent));
    }

    return this.logs.create({
      filename: productFilename,
      imported_by: staffId,
      rows_total: rows.length + errors.length,
      rows_ok: rowsOk,
      rows_failed: rowErrors.length,
      error_report_filename: errorReportFilename,
    });
  }
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/application/products/ShopifyCsvImportService.ts
git commit -m "feat: ShopifyCsvImportService — upsert products/pricing/stock/images from Shopify export"
```

---

## Task 4: Route + Controller method

**Files:**
- Modify: `src/presentation/routes/product.routes.ts`

**Interfaces:**
- Consumes: `ShopifyCsvImportService.importProducts(productBuffer, filename, storeId, staffId, inventoryBuffer?)`
- Route: `POST /api/v1/products/import/shopify-csv`
- Query param: `store_id` (required integer)
- Multipart fields: `products` (required file), `inventory` (optional file)

**Request shape (multipart/form-data):**
- `store_id` query param: `?store_id=1`
- `products`: the Shopify products CSV file
- `inventory`: (optional) the Shopify inventory CSV file

- [ ] **Step 1: Add the route to `src/presentation/routes/product.routes.ts`**

Add after the existing `// CSV import routes` block, before the closing `}`:

```ts
  // Shopify CSV import
  const { ShopifyCsvImportService } = await import('../../application/products/ShopifyCsvImportService');
  const shopifyImportService = new ShopifyCsvImportService();

  app.post('/products/import/shopify-csv', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (request, reply) => {
    const { store_id } = request.query as { store_id?: string };
    if (!store_id || isNaN(Number(store_id))) {
      throw new ValidationError('store_id query param is required');
    }
    const storeId = Number(store_id);

    const parts = request.parts();
    let productBuffer: Buffer | null = null;
    let productFilename = 'shopify-products.csv';
    let inventoryBuffer: Buffer | undefined;

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'products') {
        productBuffer = await part.toBuffer();
        productFilename = part.filename || productFilename;
      } else if (part.type === 'file' && part.fieldname === 'inventory') {
        inventoryBuffer = await part.toBuffer();
      }
    }

    if (!productBuffer) {
      throw new ValidationError('products file is required');
    }

    const log = await shopifyImportService.importProducts(
      productBuffer,
      productFilename,
      storeId,
      request.user.sub,
      inventoryBuffer,
    );

    reply.send(log);
  });
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Start the server and test with the real CSV files**

```bash
# Terminal 1 — start server
npm run dev

# Terminal 2 — test with products only (replace store_id with your actual store id)
curl -X POST "http://localhost:3002/api/v1/products/import/shopify-csv?store_id=1" \
  -H "Authorization: Bearer <admin-jwt>" \
  -F "products=@/Users/vishalpradhan/Downloads/products_export.csv"
```

Expected response:
```json
{
  "id": 1,
  "filename": "products_export.csv",
  "rows_total": 50,
  "rows_ok": 47,
  "rows_failed": 3,
  "error_report_filename": "shopify-import-errors-....csv"
}
```
(3 failures expected — the 3 rows missing both barcode and SKU)

- [ ] **Step 4: Test with both files**

```bash
curl -X POST "http://localhost:3002/api/v1/products/import/shopify-csv?store_id=1" \
  -H "Authorization: Bearer <admin-jwt>" \
  -F "products=@/Users/vishalpradhan/Downloads/products_export.csv" \
  -F "inventory=@/Users/vishalpradhan/Downloads/inventory_export.csv"
```

Expected: same shape, stock quantities set where inventory CSV had matching SKUs.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/routes/product.routes.ts
git commit -m "feat: POST /products/import/shopify-csv — Shopify product + inventory import endpoint"
```
