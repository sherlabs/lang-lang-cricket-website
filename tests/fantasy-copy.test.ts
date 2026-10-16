import { describe, expect, it } from 'vitest'
import { fantasyCopy } from '../payload/admin/copy'

describe('fantasy committee wording', () => {
  it('names the team and the person, never a PIN', () => {
    expect(fantasyCopy.pinReset('The Ducks', 'Sam', '2026-10-03')).toBe('PIN reset for The Ducks by Sam, 2026-10-03.')
    expect(fantasyCopy.disabled('The Ducks', 'Sam', '2026-10-03')).toBe('The Ducks was disabled by Sam, 2026-10-03.')
    for (const text of [fantasyCopy.pinReset('t', 'a', 'd'), fantasyCopy.renamed('a', 'b', 'c', 'd'), fantasyCopy.removed('t', 'a', 'd'), fantasyCopy.roundScored('2026-10-03', 'a', 'd', 'washed out')]) expect(text).not.toMatch(/\b\d{6}\b/)
  })
})
