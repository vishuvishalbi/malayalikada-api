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
