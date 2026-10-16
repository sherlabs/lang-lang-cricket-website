import { oversToBalls } from '@/lib/playhq/players'
import { cellText, formulaProblem, type CsvRow, type RowIssue } from './csv-parse'

/**
 * Cell readers shared by the two importers. Each returns the value or records one row-level problem
 * (row number, column, plain-English reason) and returns `undefined`.
 */
export class RowReader {
  issues: RowIssue[] = []
  constructor(private readonly row: CsvRow, private readonly index: ReadonlyMap<string, number>) {}

  get number(): number { return this.row.row }
  raw(col: string): string { return this.index.has(col) ? (this.row.cells[this.index.get(col)!] ?? '') : '' }
  has(col: string): boolean { return this.index.has(col) }
  fail(column: string | null, message: string): undefined { this.issues.push({ row: this.row.row, column, message }); return undefined }

  /** Free text: required or optional, bounded, and never something a spreadsheet could run as a formula. */
  text(col: string, o: { required?: boolean; max?: number } = {}): string | null | undefined {
    const t = cellText(this.raw(col))
    if (!t) return o.required ? this.fail(col, 'This cell is empty. Fill it in.') : null
    if (t.length > (o.max ?? 100)) return this.fail(col, `Too long (at most ${o.max ?? 100} characters).`)
    const p = formulaProblem(t)
    return p ? this.fail(col, p) : t
  }

  /** Whole number 0 or more. Blank gives `null`, or the cell is an error when required. */
  int(col: string, o: { required?: boolean; max?: number } = {}): number | null | undefined {
    const t = this.raw(col).trim()
    if (!t) return o.required ? this.fail(col, 'This cell is empty. Fill it in (0 if none).') : null
    if (!/^\d+$/.test(t)) return this.fail(col, `"${t}" is not a whole number of 0 or more.`)
    const n = Number(t)
    const max = o.max ?? 100_000
    return n > max ? this.fail(col, `${n} is too large (at most ${max.toLocaleString('en')}).`) : n
  }

  /** yes/no, true/false, y/n, 1/0 or blank (null). */
  bool(col: string): boolean | null | undefined {
    const t = this.raw(col).trim().toLowerCase()
    if (!t) return null
    if (['yes', 'y', 'true', '1'].includes(t)) return true
    if (['no', 'n', 'false', '0'].includes(t)) return false
    return this.fail(col, `"${t}" is not yes or no.`)
  }

  /** Cricket overs ("12.3" is twelve overs and three balls) as balls. Blank gives `null`. */
  overs(col: string): number | null | undefined {
    const t = this.raw(col).trim()
    if (!t) return null
    const m = /^(\d{1,4})(?:\.(\d))?$/.exec(t)
    if (!m) return this.fail(col, `"${t}" is not overs. Use cricket notation such as 12 or 12.3.`)
    if (m[2] !== undefined && Number(m[2]) > 5) return this.fail(col, `"${t}" is not overs: after the point only 0 to 5 balls are possible (12.5 is the most).`)
    return oversToBalls(Number(t))
  }
}

export function headerIndex(header: readonly string[], allowed: readonly string[], required: readonly string[]): { index: Map<string, number>; issues: RowIssue[] } {
  const issues: RowIssue[] = []
  const index = new Map<string, number>()
  header.forEach((h, i) => {
    if (!allowed.includes(h)) issues.push({ row: 1, column: h || `column ${i + 1}`, message: `Unknown column "${h}". Use the headings from the template.` })
    else if (index.has(h)) issues.push({ row: 1, column: h, message: `The column "${h}" appears twice.` })
    else index.set(h, i)
  })
  for (const r of required) if (!index.has(r)) issues.push({ row: 1, column: r, message: `The column "${r}" is missing. Start from the template.` })
  return { index, issues }
}

/** A first data cell starting with `#` is a leftover comment line: refused so it can never be read as data. */
export function commentRow(row: CsvRow): RowIssue | null {
  return row.cells[0]?.trim().startsWith('#') ? { row: row.row, column: null, message: 'A row may not start with #. Delete the note line.' } : null
}

export const isExampleName = (first: string | null | undefined, last: string | null | undefined): boolean =>
  first?.toLowerCase() === 'example' && last?.toLowerCase() === 'player'
