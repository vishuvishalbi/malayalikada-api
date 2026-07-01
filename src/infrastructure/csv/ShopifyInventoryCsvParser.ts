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
