import { parse } from 'csv-parse/sync';
import { csvUncell } from '../../shared/csv';

/** Column names match `GET /products/export/csv`, so an edited export imports back as-is. */
export interface CsvProductRow {
  /** 1-based file line, for error reports. */
  line: number;
  barcode: string;
  name: string;
  description?: string;
  category_id: string;
  brand?: string;
  unit?: string;
  weight?: string;
  supplier?: string;
  is_active?: string;
  is_featured?: string;
  store_id?: string;
  price_nzd?: string;
  cost_nzd?: string;
  stock_quantity?: string;
  /** `|`-separated image URLs. */
  image_urls?: string;
}

/** "Price NZD" / " price-nzd " → "price_nzd", so spreadsheet-edited headers still map. */
const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export class CsvParser {
  parse(buffer: Buffer): { rows: CsvProductRow[]; errors: Array<{ line: number; error: string }> } {
    const rows: CsvProductRow[] = [];
    const errors: Array<{ line: number; error: string }> = [];

    let records: unknown[];
    try {
      records = parse(buffer, {
        bom: true, // Excel "CSV UTF-8" prepends a BOM that would otherwise corrupt the first header
        columns: (header: string[]) => header.map(normalizeHeader),
        skip_empty_lines: true,
        trim: true,
        cast: (value: string) => csvUncell(value),
      });
    } catch (e: any) {
      return { rows: [], errors: [{ line: 0, error: `Parse error: ${e.message}` }] };
    }

    (records as any[]).forEach((rec, i) => {
      const lineNum = i + 2;
      if (!rec.barcode || !rec.name || !rec.category_id) {
        errors.push({ line: lineNum, error: 'Missing required fields: barcode, name, category_id' });
        return;
      }
      if (/^\d+(\.\d+)?e\+\d+$/i.test(rec.barcode)) {
        errors.push({ line: lineNum, error: `Barcode "${rec.barcode}" was converted to scientific notation by a spreadsheet` });
        return;
      }
      rows.push({ ...rec, line: lineNum });
    });

    return { rows, errors };
  }
}
