/**
 * Renders a single CSV cell: coerces to string, neutralizes spreadsheet
 * formula-injection (leading = + - @ tab CR), escapes quotes, and wraps in
 * double quotes so commas/newlines are safe.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
