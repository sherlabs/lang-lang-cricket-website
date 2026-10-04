import { describe, expect, it } from 'vitest'
import { csvCell, needsGuard, toCsv, unescapeCell } from '@/lib/stats/csv'

/** Minimal RFC 4180 reader of one cell, the inverse of the quoting in `csvCell`. */
const unquote = (cell: string): string => (cell.startsWith('"') && cell.endsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell)

describe('needsGuard (W2 spec 5.4)', () => {
  it.each(['=x', '+1', '-1', '@SUM(A1)', '|cmd', '\tx', '\rx', ' =x', '   +1', '＝x', '＋1', '－1', '＠x', "'=x", "''=x", "'  =x"])('guards %j', (s) => {
    expect(needsGuard(s)).toBe(true)
  })
  it.each(['', 'hello', "'hello", 'a=b', '1-2', 'Smith-Jones', ' x', "'"])('does not guard %j', (s) => {
    expect(needsGuard(s)).toBe(false)
  })
})

describe('csvCell', () => {
  it('prefixes one quote iff guarded, and a leading literal quote in front of a dangerous character is protected too', () => {
    expect(csvCell('=x')).toBe("'=x")
    expect(csvCell("'=x")).toBe("''=x")
    expect(csvCell("'hello")).toBe("'hello")
    expect(csvCell(' =x')).toBe("' =x")
    expect(csvCell('|x')).toBe("'|x")
    expect(csvCell('＝x')).toBe("'＝x")
  })
  it('keeps numbers, including negatives, as numbers', () => {
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(-0.5)).toBe('-0.5')
  })
  it('guards a cell inside a quoted field too', () => {
    expect(csvCell('=a,b')).toBe(`"'=a,b"`)
  })
})

describe('unescapeCell', () => {
  it('strips exactly one leading quote iff the rest is guarded', () => {
    expect(unescapeCell("'=x")).toBe('=x')
    expect(unescapeCell("''=x")).toBe("'=x")
    expect(unescapeCell("'hello")).toBe("'hello")
    expect(unescapeCell('plain')).toBe('plain')
  })
  it('round-trips random strings, including a literal leading quote, leading spaces, full-width forms and pipes', () => {
    const alphabet = ["'", '=', '+', '-', '@', '|', ' ', '\t', '\r', '＝', '＋', '－', '＠', 'a', 'Z', '7', ',', '"', '\n']
    let seed = 12345
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 4000; i++) {
      const len = Math.floor(rnd() * 8)
      const x = Array.from({ length: len }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('')
      expect(unescapeCell(unquote(csvCell(x)))).toBe(x)
    }
  })
})

describe('toCsv', () => {
  it('writes a header plus data rows only', () => {
    const out = toCsv(['Player', 'Runs'], [['=Evil', -3], ['Ann', 4]])
    expect(out).toBe("Player,Runs\r\n'=Evil,-3\r\nAnn,4\r\n")
    expect(out.split('\r\n').some((l) => l.startsWith('#'))).toBe(false)
  })
})
