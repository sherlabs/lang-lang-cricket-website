import { needsGuard, unescapeCell } from '@/lib/stats/csv'

/**
 * RFC 4180 CSV reader for the historical import (W2 spec 6.1). Pure. A byte-order mark is stripped, quoted cells
 * may hold commas, quotes (`""`) and line breaks, and the file is bounded (2 MB, 5,000 data rows, 40 columns) so
 * a mistake or a hostile upload cannot tie the server up.
 */
export const IMPORT_LIMITS = { bytes: 2 * 1024 * 1024, rows: 5000, columns: 40 } as const

export type CsvRow = { /** Spreadsheet row number: the header is row 1, the first data row is row 2. */ row: number; cells: string[] }
export type ParsedCsv = { ok: true; header: string[]; rows: CsvRow[] } | { ok: false; error: string }

export function parseCsv(input: string): ParsedCsv {
  if (new TextEncoder().encode(input).length > IMPORT_LIMITS.bytes) return { ok: false, error: 'The file is larger than 2 MB. Split it into smaller files.' }
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const records: string[][] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let any = false
  const endCell = () => { cells.push(cell); cell = '' }
  const endRecord = () => {
    endCell()
    // A blank line (one empty cell) is skipped, but still counts as a spreadsheet row, so keep a marker.
    records.push(cells)
    cells = []
    any = false
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += c
      continue
    }
    if (c === '"' && cell === '') { inQuotes = true; any = true }
    else if (c === ',') { endCell(); any = true }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRecord()
    } else { cell += c; any = true }
    if (records.length > IMPORT_LIMITS.rows + 1 + 1000) return { ok: false, error: `The file has more than ${IMPORT_LIMITS.rows} rows. Split it into smaller files.` }
  }
  if (inQuotes) return { ok: false, error: 'A quoted cell is never closed (a " is missing).' }
  if (any || cell !== '' || cells.length) endRecord()

  const numbered = records.map((cells, i) => ({ row: i + 1, cells }))
  const nonBlank = numbered.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ''))
  if (nonBlank.length === 0) return { ok: false, error: 'The file is empty.' }
  const [head, ...rows] = nonBlank
  const header = head.cells.map((h) => h.trim().toLowerCase())
  if (header.length > IMPORT_LIMITS.columns) return { ok: false, error: `The file has more than ${IMPORT_LIMITS.columns} columns.` }
  if (rows.length > IMPORT_LIMITS.rows) return { ok: false, error: `The file has more than ${IMPORT_LIMITS.rows} rows. Split it into smaller files.` }
  return { ok: true, header, rows }
}

/** A plain-English problem with one cell, tied to its row and column. */
export type RowIssue = { row: number; column: string | null; message: string }

/** The text of a cell as it is stored: the export guard's leading `'` removed, whitespace trimmed. */
export function cellText(raw: string | undefined): string {
  return unescapeCell((raw ?? '').trim()).trim()
}

/**
 * Text cells that a spreadsheet could run as a formula are refused even after the export guard is removed, so an
 * injection cannot be stored (the exporter and this check share `needsGuard`). Returns a message or null.
 */
export function formulaProblem(text: string): string | null {
  return needsGuard(text) ? 'Text may not start with = + - @ | or a tab (a spreadsheet could run it as a formula). Remove that character.' : null
}
