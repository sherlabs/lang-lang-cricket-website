import { describe, expect, it } from 'vitest'
import { cleanSource, cleanText, composerSearch, dropUnknownSources, parseComposerUrl } from '@/lib/social/url-state'

describe('composer URL state', () => {
  it('reads the deep link from the address', () => {
    expect(parseComposerUrl('?type=sponsor-thanks&source=13%2C17&style=bold&size=landscape')).toEqual({ type: 'sponsor-thanks', source: '13,17', style: 'bold', size: 'landscape', text: '', tab: null, post: null })
  })

  it('falls back to "not set" for every hostile or unknown value', () => {
    const got = parseComposerUrl('?type=<script>&source=1,2&style=neon&size=huge&tab=evil&post=-3&text=x')
    expect(got).toEqual({ type: '', source: '', style: null, size: null, text: '', tab: null, post: null })
    expect(parseComposerUrl('?type=result&style=%3Cb%3E&size=1').style).toBeNull()
    expect(parseComposerUrl('?type=result&post=1.5').post).toBeNull()
    expect(parseComposerUrl('?type=result&tab=drafts&post=7')).toMatchObject({ tab: 'drafts', post: 7 })
  })

  it('keeps at most four short ids made of safe characters', () => {
    expect(cleanSource('1,2,3,4,5,6')).toBe('1,2,3,4')
    expect(cleanSource('a|b-c.d:e_f,<img>,x y,')).toBe('a|b-c.d:e_f')
    expect(cleanSource('x'.repeat(101))).toBe('')
    expect(cleanSource(null)).toBe('')
    expect(cleanSource('1,1,1')).toBe('1')
  })

  it('caps the text and strips control characters', () => {
    expect(cleanText('a\u0000b\nc\u007f')).toBe('abc')
    expect(cleanText('z'.repeat(300)).length).toBe(80)
  })

  it('drops source ids that are not on offer', () => {
    expect(dropUnknownSources('13,99,17', new Set(['13', '17']))).toBe('13,17')
    expect(dropUnknownSources('99', new Set())).toBe('')
  })

  it('writes the address back without losing keys the composer does not own', () => {
    const state = { type: 'result' as const, source: 'single|abc', style: 'bold' as const, size: 'square' as const, text: '', post: null }
    expect(composerSearch('?tab=drafts&post=4', { ...state, post: 4 })).toBe('?tab=drafts&post=4&type=result&source=single%7Cabc&style=bold&size=square')
    expect(composerSearch('?type=result&source=a&style=bold&size=square&text=hi', { ...state, type: '', source: '', text: '' })).toBe('')
    // style and size are only written once something is picked
    expect(composerSearch('', { ...state, source: '' })).toBe('?type=result')
  })
})
