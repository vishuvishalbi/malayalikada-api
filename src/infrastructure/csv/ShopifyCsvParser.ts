import { parse } from 'csv-parse/sync';

export interface ShopifyProductRow {
  handle: string;
  name: string;
  vendor: string | null;
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
    const barcode = (rec['Variant Barcode'] || sku || rec['Handle'] || '').trim();
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
      categoryPath: (rec['Product Category'] || '').trim(),
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
