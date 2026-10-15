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

describe('export CSV round-trip parsing', () => {
  it('maps an Excel-saved export (BOM, renamed headers, formula guard) back to typed values', async () => {
    const { CsvParser } = await import('../../infrastructure/csv/CsvParser');
    const { parseOptionalColumns } = await import('./CsvImportService');
    const csv = '﻿Barcode,Name,Category ID,Description,Is Active,is_featured,Store ID,Price NZD,cost_nzd,stock_quantity,image_urls\n'
      + `"0123","Rice","4","'-50% off","false","TRUE","3","12.5","","7","https://x/uploads/a.jpg | https://cdn/b.png?v=1"\n`
      + '9.31E+12,Bad,4,,,,,,,,\n';
    const { rows, errors } = new CsvParser().parse(Buffer.from(csv));
    expect(errors).toEqual([{ line: 3, error: expect.stringMatching(/scientific notation/) }]);
    expect(rows[0]).toMatchObject({ line: 2, barcode: '0123', category_id: '4', description: '-50% off' });

    expect(parseOptionalColumns(rows[0], new Set([3]))).toEqual({
      isActive: false, isFeatured: true, storeId: 3, price: 12.5, cost: undefined, stock: 7,
      imageUrls: ['https://x/uploads/a.jpg', 'https://cdn/b.png?v=1'],
    });
    expect(() => parseOptionalColumns({ ...rows[0], stock_quantity: '1.5' }, new Set([3]))).toThrow(/stock_quantity/);
    expect(() => parseOptionalColumns({ ...rows[0], store_id: '' }, new Set([3]))).toThrow(/store_id is required/);
    expect(() => parseOptionalColumns(rows[0], new Set([9]))).toThrow(/Unknown store_id/);
  });
});
