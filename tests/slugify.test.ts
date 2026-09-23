import { describe, it, expect } from 'vitest'
import { slugify, makeUniqueSlug } from '@/lib/slugify'

describe('slugify', () => {
  it('lowercases, strips punctuation and collapses separators', () => {
    expect(slugify("The Club's 50th Anniversary!")).toBe('the-clubs-50th-anniversary')
  })

  it('falls back to "story" for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('story')
  })
})

describe('makeUniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const slug = await makeUniqueSlug('Grand Final Recap', async () => false)
    expect(slug).toBe('grand-final-recap')
  })

  it('appends -2, -3, ... until a free slug is found', async () => {
    const taken = new Set(['grand-final-recap', 'grand-final-recap-2'])
    const slug = await makeUniqueSlug('Grand Final Recap', async (s) => taken.has(s))
    expect(slug).toBe('grand-final-recap-3')
  })

  it('treats "submit" as reserved so it never collides with /history/submit', async () => {
    const slug = await makeUniqueSlug('Submit', async () => false)
    expect(slug).toBe('submit-2')
  })
})
