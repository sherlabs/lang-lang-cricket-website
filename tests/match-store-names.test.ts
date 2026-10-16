import { describe, expect, it } from 'vitest'
import { displayNameFromKey, formatDismissal, HIDDEN_CLUB_NAME, resolveRowName, UNKNOWN_NAME } from '@/lib/match-store/names'

const players = new Map([
  [1, { name: 'Corey Ashby', hidden: false }],
  [2, { name: 'Hamish Glover', hidden: true }],
  [3, { name: '   ', hidden: false }],
])

describe('resolveRowName', () => {
  it('shows a visible club player by name', () => {
    expect(resolveRowName({ player: 1, displayName: null }, players)).toBe('Corey Ashby')
  })
  it('suppresses a hidden club player, a blank name, a missing player and an unresolved club row', () => {
    expect(resolveRowName({ player: 2, displayName: null }, players)).toBe(HIDDEN_CLUB_NAME)
    expect(resolveRowName({ player: 3, displayName: null }, players)).toBe(HIDDEN_CLUB_NAME)
    expect(resolveRowName({ player: 99, displayName: null }, players)).toBe(HIDDEN_CLUB_NAME)
    expect(resolveRowName({ player: null, displayName: null }, players)).toBe(HIDDEN_CLUB_NAME)
  })
  it('a stored display name never wins over a club link, and an opposition row uses it', () => {
    expect(resolveRowName({ player: 2, displayName: 'Hamish Glover' }, players)).toBe(HIDDEN_CLUB_NAME)
    expect(resolveRowName({ player: null, displayName: 'Blake Archer' }, players)).toBe('Blake Archer')
    expect(resolveRowName({ player: null, displayName: '  ' }, players)).toBe(UNKNOWN_NAME)
  })
})

describe('formatDismissal (names resolved through appearance ids by the caller)', () => {
  it('matches the scorecard wording', () => {
    expect(formatDismissal('out', 'bowled', 'B', null)).toBe('b B')
    expect(formatDismissal('out', 'caught', 'B', 'F')).toBe('c F b B')
    expect(formatDismissal('out', 'caught_and_bowled', 'B', 'B')).toBe('c & b B')
    expect(formatDismissal('out', 'lbw', 'B', null)).toBe('lbw b B')
    expect(formatDismissal('out', 'stumped', 'B', 'K')).toBe('st K b B')
    expect(formatDismissal('out', 'run_out', null, 'F')).toBe('run out (F)')
    expect(formatDismissal('out', 'run_out', null, null)).toBe('run out')
    expect(formatDismissal('out', 'hit_wicket', 'B', null)).toBe('hit wicket b B')
    expect(formatDismissal('out', 'retired_hurt', null, null)).toBe('retired hurt')
    expect(formatDismissal('out', null, null, null)).toBe('out')
    expect(formatDismissal('out', 'other', null, null)).toBe('out')
    expect(formatDismissal('not_out', null, null, null)).toBe('not out')
    expect(formatDismissal('unknown', null, null, null)).toBe('')
    expect(formatDismissal('did_not_bat', null, null, null)).toBe('did not bat')
  })
  it('a hidden fielder shows as "a club player" inside the dismissal', () => {
    const fielder = resolveRowName({ player: 2, displayName: null }, players)
    const bowler = resolveRowName({ player: null, displayName: 'Blake Archer' }, players)
    expect(formatDismissal('out', 'caught', bowler, fielder)).toBe('c a club player b Blake Archer')
    expect(formatDismissal('out', 'caught', bowler, fielder)).not.toContain('Glover')
  })
  it('a missing bowler or fielder is a question mark', () => {
    expect(formatDismissal('out', 'caught', null, null)).toBe('c ? b ?')
  })
})

describe('displayNameFromKey', () => {
  it('title-cases a first|last key', () => {
    expect(displayNameFromKey('daniel|whitlock')).toBe('Daniel Whitlock')
    expect(displayNameFromKey("kieran|nash-bell")).toBe('Kieran Nash-Bell')
    expect(displayNameFromKey('cher|')).toBe('Cher')
  })
})
