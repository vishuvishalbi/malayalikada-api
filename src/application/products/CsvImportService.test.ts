import { describe, it, expect, vi } from 'vitest';
import { MAX_IMPORT_ROWS } from './CsvImportService';

// Build a CSV buffer with N valid-looking product rows.
function csvWithRows(n: number): Buffer {
  const header = 'barcode,name,category_id\n';
  const rows = Array.from({ length: n }, (_, i) => `bc${i},Item ${i},1`).join('\n');
  return Buffer.from(header + rows);
}

describe('CsvImportService row cap', () => {
  it('exposes a sane MAX_IMPORT_ROWS', () => {
    expect(MAX_IMPORT_ROWS).toBe(5000);
  });

  it('rejects a file over the cap without touching the DB', async () => {
    // Import lazily so the DB pool isn't hit; mock connection module.
    vi.doMock('../../infrastructure/database/connection', () => ({
      db: { query: vi.fn(), getConnection: vi.fn() },
    }));
    const { CsvImportService } = await import('./CsvImportService');
    const svc = new CsvImportService();
    await expect(
      svc.importFile(csvWithRows(MAX_IMPORT_ROWS + 1), 'big.csv', 1),
    ).rejects.toThrow(/Too many rows/);
  });
});
