import { describe, expect, it } from 'vitest'
import { instagramAdapter, xAdapter, facebookAdapter } from '@/lib/social/adapters/stubs'
import { cleanHashtags, composeFinalText, networkLength, validateCaption, X_LINK_LENGTH } from '@/lib/social/final-text'

describe('final text', () => {
  const tags = ['one', 'two', 'three', 'four', 'five']
  it('adds the sign-off and the first N hashtags the network takes', () => {
    const t = composeFinalText({ body: ' Won by 24 runs ', signOff: 'Go club', hashtags: tags, limits: { maxChars: 280, maxHashtags: 3 } })
    expect(t).toBe('Won by 24 runs\n\nGo club\n\n#one #two #three')
  })
  it('is a pure function of its inputs (settings changed afterwards change nothing already composed)', () => {
    const args = { body: 'Body', signOff: 'A', hashtags: ['x'], limits: { maxChars: 100, maxHashtags: 5 } }
    const first = composeFinalText(args)
    const again = composeFinalText({ ...args, signOff: 'B', hashtags: ['y'] })
    expect(first).toBe('Body\n\nA\n\n#x')
    expect(again).toBe('Body\n\nB\n\n#y')
    expect(composeFinalText(args)).toBe(first)
  })
  it('keeps only safe hashtags: no mentions, links or odd characters', () => {
    expect(cleanHashtags(['ok', '#fine', '@someone', 'http://x.co', 'has space', 'ok', 'a-b'])).toEqual(['ok', 'fine'])
  })
})

describe('caption limits', () => {
  it('counts every link as 23 characters on X', () => {
    const text = `Result https://club.example/matches/with/a/very/long/path/that/goes/on/and/on`
    expect(networkLength('x', text)).toBe('Result '.length + X_LINK_LENGTH)
    expect(networkLength('facebook', text)).toBe(text.length)
  })
  it('X: an error over 280, fine at 280', () => {
    const ok = 'a'.repeat(280)
    expect(validateCaption('x', ok, xAdapter.limits, 'X').errors).toEqual([])
    expect(validateCaption('x', `${ok}a`, xAdapter.limits, 'X').errors).toHaveLength(1)
    // A long link still fits because it counts as 23.
    expect(validateCaption('x', `${'a'.repeat(250)} https://club.example/${'p'.repeat(200)}`, xAdapter.limits, 'X').errors).toEqual([])
  })
  it('Instagram: 2,200 characters and 30 hashtags', () => {
    expect(validateCaption('instagram', 'a'.repeat(2201), instagramAdapter.limits, 'Instagram').errors).toHaveLength(1)
    const tagged = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ')
    expect(validateCaption('instagram', `hello ${tagged}`, instagramAdapter.limits, 'Instagram').errors).toHaveLength(1)
    expect(validateCaption('instagram', `hello ${Array.from({ length: 30 }, (_, i) => `#t${i}`).join(' ')}`, instagramAdapter.limits, 'Instagram').errors).toEqual([])
  })
  it('Facebook: a very long caption is fine', () => {
    expect(validateCaption('facebook', 'a'.repeat(5000), facebookAdapter.limits, 'Facebook').errors).toEqual([])
  })
  it('warns (without blocking) near the limit, and blocks an empty caption', () => {
    const r = validateCaption('x', 'a'.repeat(270), xAdapter.limits, 'X')
    expect(r.errors).toEqual([])
    expect(r.warnings).toHaveLength(1)
    expect(validateCaption('x', '  ', xAdapter.limits, 'X').errors).toHaveLength(1)
  })
})
