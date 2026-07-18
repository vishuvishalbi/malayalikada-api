import { describe, it, expect } from 'vitest';
import { csvCell } from './csv';

describe('csvCell', () => {
  it('wraps plain values in quotes and escapes inner quotes', () => {
    expect(csvCell('hi')).toBe('"hi"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it('neutralizes formula-leading characters', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('-1')).toBe(`"'-1"`);
    expect(csvCell('@x')).toBe(`"'@x"`);
  });
  it('stringifies numbers and null', () => {
    expect(csvCell(12.5)).toBe('"12.5"');
    expect(csvCell(null)).toBe('""');
  });
});
