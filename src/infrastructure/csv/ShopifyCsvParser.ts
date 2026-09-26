import { parse } from 'csv-parse/sync';

export interface ShopifyProductRow {
  handle: string;
  name: string;
  vendor: string | null;
  /**
   * Category name resolved from the export, in Shopify's own order of
   * specificity: the merchant-assigned `Type`, then the `Product Category`
   * taxonomy path, then the first tag. Empty when the row carries no category
   * at all — callers must decide what to do rather than invent one.
   */
  categoryPath: string;
  barcode: string;
  sku: string;
  price: number;
  costPerItem: number | null;
  weight: number | null;
  imageUrl: string | null;
  status: string;
  inventoryQty: number;
}

export interface ShopifyParseResult {
  rows: ShopifyProductRow[];
  errors: Array<{ line: number; error: string }>;
}

/**
 * Shopify spreads category information across three columns and populates them
 * inconsistently: `Product Category` is the standard taxonomy (often blank),
 * `Type` is the merchant's own label (usually set), and `Tags` is free-form.
 * Reading only the first leaves most rows uncategorised, so fall through them
 * in order of how specific each is to this merchant's catalogue.
 */
function resolveCategory(rec: Record<string, string>): string {
  const type = (rec['Type'] || '').trim();
  if (type) return type;

  const taxonomy = (rec['Product Category'] || '').trim();
  if (taxonomy) return taxonomy;

  const firstTag = (rec['Tags'] || '').split(',')[0]?.trim() ?? '';
  return firstTag;
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

    const sku = (rec['Variant SKU'] || '').trim();
    // Shopify exports label the column 'Variant Barcodes' (plural); older ones use the singular.
    const barcode = (rec['Variant Barcodes'] || rec['Variant Barcode'] || sku || rec['Handle'] || '').trim();
    if (!barcode) {
      errors.push({ line: lineNum, error: `Row skipped: no barcode, SKU or Handle for "${rec['Handle']}"` });
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

    const rawCost = (rec['Cost per item'] || '').trim();
    const costPerItem = rawCost ? parseFloat(rawCost) : null;

    const rawWeight = (rec['Variant Grams'] || '').trim();
    const _parsedW = rawWeight ? parseFloat(rawWeight) : null;
    const weight = (_parsedW !== null && !isNaN(_parsedW) && _parsedW > 0) ? _parsedW : null;

    rows.push({
      handle: rec['Handle'] || '',
      name,
      vendor: (rec['Vendor'] || '').trim() || null,
      categoryPath: resolveCategory(rec),
      barcode,
      sku,
      price,
      costPerItem: costPerItem !== null && !isNaN(costPerItem) ? costPerItem : null,
      weight,
      imageUrl: (rec['Image Src'] || '').trim() || null,
      status: (rec['Status'] || 'active').trim().toLowerCase(),
      inventoryQty: Math.max(0, parseInt(rec['Variant Inventory Qty'] || '0', 10) || 0),
    });
  });

  return { rows, errors };
}
