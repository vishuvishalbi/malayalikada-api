export function generateReferenceNumber(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `MK-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}

export function paginate(page: number, limit: number): { offset: number; limit: number } {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  return { offset: (safePage - 1) * safeLimit, limit: safeLimit };
}
