/**
 * RFC 4180 CSV with a spreadsheet formula-injection guard (W2 spec 5.4). String cells that a
 * spreadsheet could read as a formula get a leading `'`; numbers (including negatives) are written
 * as they are. `needsGuard` is the one predicate for export and import, so the two always agree.
 */
export type CsvCell = string | number | null | undefined

/** Characters that start a formula in Excel, Sheets and LibreOffice, plus the full-width look-alikes. */
const TRIGGER = /^[=+\-@|\t\r＝＋－＠]/

/**
 * True when a spreadsheet could treat the string as a formula: it starts (after leading spaces) with
 * a trigger character, or it starts with `'` and the rest is itself guarded (so a real leading `'`
 * in front of a dangerous character is protected too and round-trips).
 */
export function needsGuard(s: string): boolean {
  const t = s.replace(/^ +/, '')
  if (TRIGGER.test(t)) return true
  return s.startsWith("'") && needsGuard(s.slice(1))
}

/** Undo the export guard: strip exactly one leading `'` iff the string starts with `'` and the rest is guarded. */
export function unescapeCell(s: string): string {
  return s.startsWith("'") && needsGuard(s.slice(1)) ? s.slice(1) : s
}

export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  const s = needsGuard(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
