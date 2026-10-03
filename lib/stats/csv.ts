/**
 * RFC 4180 CSV with a spreadsheet formula-injection guard (spec A11). String cells starting
 * with `=`, `+`, `-`, `@`, tab or carriage return get a leading `'`; numbers (including
 * negatives) are written as they are.
 */
export type CsvCell = string | number | null | undefined

const DANGEROUS = /^[=+\-@\t\r]/

export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  const s = DANGEROUS.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
