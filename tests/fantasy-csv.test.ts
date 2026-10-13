import { describe, expect, it } from 'vitest'
import { leaderboardCsv } from '../lib/fantasy/csv'
import { checkNameShape, cleanTeamName, isBlockedName, nameKeyOf } from '../lib/fantasy/names'

describe('leaderboard CSV', () => {
  it('writes a text cell for a team name that starts like a formula', () => {
    const csv = leaderboardCsv([
      { rank: 1, teamName: '=HYPERLINK("http://x")', total: 10, best: 10, rounds: 1, joined: '2025-10-01' },
      { rank: 2, teamName: '+1', total: 5, best: 5, rounds: 1, joined: '2025-10-01' },
      { rank: 3, teamName: '@cmd', total: 4, best: 4, rounds: 1, joined: '2025-10-01' },
      { rank: 4, teamName: '-2', total: 3, best: 3, rounds: 1, joined: '2025-10-01' },
    ])
    const lines = csv.trim().split('\r\n')
    expect(lines[1].split(',')[1]).toMatch(/^"?'=/)
    expect(lines[2]).toContain("'+1")
    expect(lines[3]).toContain("'@cmd")
    expect(lines[4]).toContain("'-2")
    expect(lines[0]).toBe('Rank,Team,Total points,Best round,Rounds scored,Joined')
  })
  it('keeps a plain name and a negative total as they are, and quotes commas', () => {
    const csv = leaderboardCsv([{ rank: 1, teamName: 'Ducks, Inc', total: -3, best: -3, rounds: 1, joined: '2025-10-01' }])
    expect(csv).toContain('"Ducks, Inc",-3,-3')
  })
})

describe('team names', () => {
  it('trim and collapse spaces, 2 to 30 characters, plain characters only', () => {
    expect(checkNameShape('  The   Ducks ')).toMatchObject({ ok: true, name: 'The Ducks' })
    expect(checkNameShape('a').ok).toBe(false)
    expect(checkNameShape('x'.repeat(31)).ok).toBe(false)
    expect(checkNameShape('<script>').ok).toBe(false)
    expect(checkNameShape('Dave 🏏').ok).toBe(false)
    expect(checkNameShape('​ab').ok).toBe(false)
    expect(checkNameShape(42).ok).toBe(false)
    expect(checkNameShape('!!').ok).toBe(false)
  })
  it('fold case, accents, spacing and punctuation into one key', () => {
    expect(nameKeyOf('The  Ducks!')).toBe(nameKeyOf('the ducks'))
    expect(nameKeyOf('Café')).toBe(nameKeyOf('cafe'))
    expect(nameKeyOf('T.h.e Ducks')).toBe(nameKeyOf('THE DUCKS'))
    expect(cleanTeamName(' a \n b ')).toBe('a b')
  })
  it('blocked words match inside the folded name, so spacing tricks do not help', () => {
    expect(isBlockedName(nameKeyOf('Big B.a.d Word'), ['badword'])).toBe(true)
    expect(isBlockedName(nameKeyOf('Fine Name'), ['badword', ''])).toBe(false)
  })
})
