import { describe, expect, it } from 'vitest'
import { IMPORT_LIMITS, cellText, formulaProblem, parseCsv } from '@/lib/history-import/csv-parse'
import { csvCell } from '@/lib/stats/csv'

const ok = (text: string) => {
  const r = parseCsv(text)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('parseCsv', () => {
  it('reads a header and rows with spreadsheet row numbers', () => {
    const r = ok('A,B\r\n1,2\r\n3,4\r\n')
    expect(r.header).toEqual(['a', 'b'])
    expect(r.rows).toEqual([{ row: 2, cells: ['1', '2'] }, { row: 3, cells: ['3', '4'] }])
  })

  it('strips a byte-order mark and accepts LF line ends', () => {
    expect(ok('﻿a,b\n1,2').header).toEqual(['a', 'b'])
  })

  it('reads quoted commas, doubled quotes and line breaks inside a cell', () => {
    const r = ok('a,b\n"x, y","say ""hi"""\n"two\nlines",z\n')
    expect(r.rows[0].cells).toEqual(['x, y', 'say "hi"'])
    expect(r.rows[1].cells).toEqual(['two\nlines', 'z'])
    // A multi-line cell is one spreadsheet row.
    expect(r.rows[1].row).toBe(3)
  })

  it('skips blank lines but keeps spreadsheet row numbers', () => {
    const r = ok('a,b\n\n1,2\n')
    expect(r.rows).toEqual([{ row: 3, cells: ['1', '2'] }])
  })

  it('refuses an unclosed quote, an empty file, too many columns, too many rows and a big file', () => {
    expect(parseCsv('a,b\n"x,1')).toMatchObject({ ok: false })
    expect(parseCsv('')).toMatchObject({ ok: false })
    expect(parseCsv(Array.from({ length: IMPORT_LIMITS.columns + 1 }, (_, i) => `c${i}`).join(','))).toMatchObject({ ok: false, error: expect.stringContaining('columns') })
    const many = 'a\n' + Array.from({ length: IMPORT_LIMITS.rows + 1 }, () => '1').join('\n')
    expect(parseCsv(many)).toMatchObject({ ok: false, error: expect.stringContaining('rows') })
    expect(parseCsv('a\n' + 'x'.repeat(IMPORT_LIMITS.bytes + 1))).toMatchObject({ ok: false, error: expect.stringContaining('2 MB') })
  })
})

describe('formula guard on import', () => {
  it('removes the export guard once, then refuses text a spreadsheet could run', () => {
    expect(cellText("'=x")).toBe('=x')
    expect(formulaProblem(cellText("'=x"))).not.toBeNull()
    expect(formulaProblem(cellText('=x'))).not.toBeNull()
    expect(formulaProblem(cellText('| cmd'))).not.toBeNull()
    expect(formulaProblem(cellText('Smith'))).toBeNull()
  })

  it('keeps a real leading apostrophe that guards nothing', () => {
    expect(cellText("'hello")).toBe("'hello")
    expect(formulaProblem("'hello")).toBeNull()
  })

  it('round-trips ordinary text through the exporter and the importer', () => {
    for (const s of ["O'Brien", 'A, B', 'say "hi"', 'plain']) {
      const r = ok(`a\n${csvCell(s)}\n`)
      expect(cellText(r.rows[0].cells[0])).toBe(s)
    }
  })
})
