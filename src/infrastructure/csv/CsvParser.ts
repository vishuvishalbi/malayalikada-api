import { parse } from 'csv-parse/sync';

export interface CsvProductRow {
  barcode: string;
  name: string;
  description?: string;
  category_id: string;
  brand?: string;
  unit?: string;
  weight?: string;
  supplier?: string;
}

export class CsvParser {
  parse(buffer: Buffer): { rows: CsvProductRow[]; errors: Array<{ line: number; error: string }> } {
    const rows: CsvProductRow[] = [];
    const errors: Array<{ line: number; error: string }> = [];

    let records: unknown[];
    try {
      records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e: any) {
      return { rows: [], errors: [{ line: 0, error: `Parse error: ${e.message}` }] };
    }

    (records as any[]).forEach((rec, i) => {
      const lineNum = i + 2;
      if (!rec.barcode || !rec.name || !rec.category_id) {
        errors.push({ line: lineNum, error: 'Missing required fields: barcode, name, category_id' });
        return;
      }
      rows.push(rec as CsvProductRow);
    });

    return { rows, errors };
  }
}
