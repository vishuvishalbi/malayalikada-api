import { parse } from 'csv-parse/sync';

export interface EposNowCategoryRow {
  externalId: string;
  name: string;
  parentExternalId: string | null;
}

export interface EposNowCategoryParseResult {
  rows: EposNowCategoryRow[];
  errors: Array<{ line: number; error: string }>;
}

export function parseEposNowCategoryCsv(buffer: Buffer): EposNowCategoryParseResult {
  const rows: EposNowCategoryRow[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  let records: unknown[];
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (e: any) {
    return { rows: [], errors: [{ line: 0, error: `Parse error: ${e.message}` }] };
  }

  (records as any[]).forEach((rec, i) => {
    const lineNum = i + 2;

    const externalId = (rec['CategoryID'] || '').trim();
    const name = (rec['Category Name'] || '').trim();
    if (!externalId || !name) {
      errors.push({ line: lineNum, error: `Row skipped: missing CategoryID or Category Name` });
      return;
    }

    rows.push({
      externalId,
      name,
      parentExternalId: (rec['Parent Category ID'] || '').trim() || null,
    });
  });

  return { rows, errors };
}

export interface EposNowProductRow {
  externalId: string;
  name: string;
  description: string | null;
  costPrice: number | null;
  sellingPrice: number;
  categoryName: string;
  brand: string | null;
  barcode: string;
  sku: string | null;
  weight: number | null;
  isSellOnTill: boolean;
}

export interface EposNowProductParseResult {
  rows: EposNowProductRow[];
  errors: Array<{ line: number; error: string }>;
}

const WEIGHT_IN_NAME = /([\d.]+)\s*(kg|g)\b/i;

/** products.weight is kilograms per unit ("200G" -> 0.2, "5KG" -> 5). */
export function parseWeightFromName(name: string): number | null {
  const m = name.match(WEIGHT_IN_NAME);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (isNaN(value) || value <= 0) return null;
  const kg = m[2].toLowerCase() === 'kg' ? value : value / 1000;
  return Math.round(kg * 1000) / 1000;
}

export function parseEposNowProductCsv(buffer: Buffer): EposNowProductParseResult {
  const rows: EposNowProductRow[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  let records: unknown[];
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (e: any) {
    return { rows: [], errors: [{ line: 0, error: `Parse error: ${e.message}` }] };
  }

  (records as any[]).forEach((rec, i) => {
    const lineNum = i + 2;

    const barcode = (rec['Barcode'] || rec['SKU'] || '').trim();
    if (!barcode) {
      errors.push({ line: lineNum, error: `Row skipped: no Barcode or SKU for "${rec['Product Name']}"` });
      return;
    }

    const name = (rec['Product Name'] || '').trim();
    if (!name) {
      errors.push({ line: lineNum, error: `Row skipped: missing Product Name` });
      return;
    }

    const sellingPrice = parseFloat(rec['Selling Price'] || '');
    if (isNaN(sellingPrice)) {
      errors.push({ line: lineNum, error: `Row skipped: invalid Selling Price "${rec['Selling Price']}"` });
      return;
    }

    const categoryName = (rec['Category Name'] || '').trim();
    if (!categoryName) {
      errors.push({ line: lineNum, error: `Row skipped: missing Category Name` });
      return;
    }

    const rawCost = (rec['Cost Price'] || '').trim();
    const parsedCost = rawCost ? parseFloat(rawCost) : null;
    const costPrice = parsedCost !== null && !isNaN(parsedCost) && parsedCost > 0 ? parsedCost : null;

    rows.push({
      externalId: (rec['ProductID'] || '').trim(),
      name,
      description: cleanDescription(rec['Product Description'], rec['Product Name'] ?? rec['Name']),
      costPrice,
      sellingPrice,
      categoryName,
      brand: (rec['Brand Name'] || '').trim() || null,
      barcode,
      sku: (rec['SKU'] || '').trim() || null,
      weight: parseWeightFromName(name),
      isSellOnTill: (rec['Sell On Till'] || '').trim().toLowerCase() === 'y',
    });
  });

  return { rows, errors };
}

/** EPOS exports often repeat the product name as its description; treat that as no description. */
function cleanDescription(raw: string | undefined, name: string | undefined): string | null {
  const d = (raw || '').trim();
  if (!d) return null;
  return d.toLowerCase() === (name || '').trim().toLowerCase() ? null : d;
}
