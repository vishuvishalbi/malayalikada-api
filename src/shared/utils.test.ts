import { describe, it, expect } from 'vitest';
import { generateReferenceNumber } from './utils';

describe('generateReferenceNumber', () => {
  it('formats date and sequence into MK-YYYYMMDD-NNNN', () => {
    const result = generateReferenceNumber(new Date(2026, 6, 15), 7);
    expect(result).toBe('MK-20260715-0007');
  });
});
