import { describe, it, expect } from 'vitest'
import {
  excerpt,
  bodyParagraphs,
  shouldShowBanner,
  formatAnnouncementDate,
} from '@/lib/announcements-format'

describe('excerpt', () => {
  it('returns a short first line untouched', () => {
    expect(excerpt('Training moved to Thursday.\n\nMore below.')).toBe('Training moved to Thursday.')
  })

  it('skips leading blank lines and trims', () => {
    expect(excerpt('\n  \n  Hello there  \nsecond')).toBe('Hello there')
  })

  it('truncates on a word boundary with an ellipsis', () => {
    const line = 'The clubrooms will be closed for renovations from Monday 6 October until further notice while the kitchen is refitted and the bar is rebuilt.'
    const out = excerpt(line, 140)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(141)
    // Never cut mid-word and never leave trailing punctuation before the ellipsis.
    expect(line.startsWith(out.slice(0, -1))).toBe(true)
    expect(out.slice(0, -1)).not.toMatch(/[\s,.]$/)
  })

  it('handles CRLF and empty bodies', () => {
    expect(excerpt('First\r\nSecond')).toBe('First')
    expect(excerpt('')).toBe('')
    expect(excerpt('\n\n')).toBe('')
  })
})

describe('bodyParagraphs', () => {
  it('splits on blank lines and keeps single breaks inside a paragraph', () => {
    expect(bodyParagraphs('Line one\nline two\n\nPara two')).toEqual(['Line one\nline two', 'Para two'])
  })

  it('treats whitespace-only lines as paragraph breaks and drops empties', () => {
    expect(bodyParagraphs('A\n  \nB\n\n\n\nC\n')).toEqual(['A', 'B', 'C'])
  })

  it('normalises CRLF', () => {
    expect(bodyParagraphs('A\r\n\r\nB')).toEqual(['A', 'B'])
  })

  it('returns an empty list for an empty body', () => {
    expect(bodyParagraphs('')).toEqual([])
  })
})

describe('shouldShowBanner', () => {
  it('hides when nothing is published', () => {
    expect(shouldShowBanner(null, undefined)).toBe(false)
    expect(shouldShowBanner(null, '3')).toBe(false)
  })

  it('shows when there is no cookie', () => {
    expect(shouldShowBanner(3, undefined)).toBe(true)
  })

  it('shows again for a newer announcement than the dismissed one', () => {
    expect(shouldShowBanner(4, '3')).toBe(true)
  })

  it('hides the announcement that was dismissed (string cookie vs numeric id)', () => {
    expect(shouldShowBanner(3, '3')).toBe(false)
  })
})

describe('formatAnnouncementDate', () => {
  it('formats in Melbourne time, en-AU order', () => {
    // 15:30 UTC on 30 Sep is already 1 Oct in Melbourne (AEST/AEDT).
    expect(formatAnnouncementDate(new Date('2026-09-30T15:30:00Z'))).toBe('1 October 2026')
    expect(formatAnnouncementDate(new Date('2026-09-30T01:00:00Z'))).toBe('30 September 2026')
  })
})
