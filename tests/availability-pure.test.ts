import { describe, expect, it } from 'vitest'
import { changesClosed, cleanNote, effectiveAvailability, tally } from '../lib/availability'
import { availCookieName, serializeAvailCookie, signAvailCookie, tokenMatches, linkToken, verifyAvailCookie } from '../lib/availability-link'
import { globalKey, GLOBAL_RULE, nameBucket, nameKey, NAME_RULE } from '../lib/availability-throttle'
import { matchPlayers } from '../lib/selection/name-match'

const S = 'a-test-secret-of-some-length-1234567'

describe('effectiveAvailability', () => {
  const rows = [{ fixtureId: 1, status: 'in' as const }, { fixtureId: '2', status: 'out' as const }]
  it('is the explicit answer, else no reply', () => {
    expect(effectiveAvailability(rows, 1)).toBe('in')
    expect(effectiveAvailability(rows, 2)).toBe('out')
    expect(effectiveAvailability(rows, 3)).toBe('none')
    expect(effectiveAvailability([], 1)).toBe('none')
  })
  it('tallies every answer', () => {
    expect(tally(['in', 'in', 'maybe', 'none', 'out'])).toEqual({ in: 2, maybe: 1, out: 1, none: 1 })
  })
})

describe('notes and the change cutoff', () => {
  it('cleans and caps a note', () => {
    expect(cleanNote('  hi\n\tthere\u0000 ', 140)).toBe('hi there')
    expect(cleanNote('x'.repeat(300), 140)).toHaveLength(140)
    expect(cleanNote(42, 140)).toBe('')
  })
  it('closes changes N hours before the start, never when 0', () => {
    const start = '2026-10-10T03:00:00.000Z'
    expect(changesClosed(start, 0, new Date('2026-10-10T04:00:00Z'))).toBe(false)
    expect(changesClosed(start, 24, new Date('2026-10-09T02:00:00Z'))).toBe(false)
    expect(changesClosed(start, 24, new Date('2026-10-09T03:00:00Z'))).toBe(true)
    expect(changesClosed(null, 24)).toBe(false)
  })
})

describe('availability link token', () => {
  it('is derived from the version: 43 characters, stable, different per version', () => {
    const t1 = linkToken(1, S)
    expect(t1).toHaveLength(43)
    expect(linkToken(1, S)).toBe(t1)
    expect(linkToken(2, S)).not.toBe(t1)
    expect(linkToken(1, 'another-secret-of-some-length-12345678')).not.toBe(t1)
  })
  it('matches only the current version, and rejects junk', () => {
    expect(tokenMatches(linkToken(3, S), 3, S)).toBe(true)
    expect(tokenMatches(linkToken(3, S), 4, S)).toBe(false)
    for (const bad of ['', null, undefined, 'short', 'x'.repeat(43), `${linkToken(3, S)}x`]) expect(tokenMatches(bad as never, 3, S), String(bad)).toBe(false)
  })
})

describe('remembered-device cookie', () => {
  const now = Date.UTC(2026, 9, 5)
  const data = { playerId: 7, linkVersion: 2, iat: now }
  it('round-trips and rejects tampering, another key, expiry and shapes', () => {
    const v = signAvailCookie(data, S)
    expect(verifyAvailCookie(v, now + 1000, S)).toEqual(data)
    expect(verifyAvailCookie(v.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), now, S)).toBeNull()
    expect(verifyAvailCookie(v, now, 'another-secret-of-some-length-12345678')).toBeNull()
    expect(verifyAvailCookie(v, now + 91 * 86_400_000, S)).toBeNull()
    expect(verifyAvailCookie(`${v}.x`, now, S)).toBeNull()
    expect(verifyAvailCookie(null, now, S)).toBeNull()
    const body = Buffer.from(JSON.stringify({ playerId: '7', linkVersion: 2, iat: now })).toString('base64url')
    expect(verifyAvailCookie(`${body}.x`, now, S)).toBeNull()
  })
  it('uses the __Host- prefix and Secure only in production', () => {
    expect(availCookieName(true)).toMatch(/^__Host-.+_avail$/)
    expect(availCookieName(false)).toMatch(/^[a-z0-9]+_avail$/i)
    expect(serializeAvailCookie('v', true)).toMatch(/Secure/)
    expect(serializeAvailCookie('v', true)).toMatch(/Path=\//)
    expect(serializeAvailCookie('v', false)).not.toMatch(/Secure/)
    expect(serializeAvailCookie(null, true)).toMatch(/Max-Age=0/)
  })
})

describe('throttle keys and rules', () => {
  it('locks on the 5th failure per name and the 300th per link', () => {
    expect(NAME_RULE.limit).toBe(4)
    expect(NAME_RULE.lockMs).toBe(15 * 60_000)
    expect(GLOBAL_RULE.limit).toBe(299)
  })
  it('puts unknown names into 64 buckets and gives known names their own key; every key carries the link version', () => {
    const buckets = new Set(Array.from({ length: 2000 }, (_, i) => nameKey(1, `random name ${i}`, false)))
    expect(buckets.size).toBeLessThanOrEqual(64)
    expect(buckets.size).toBeGreaterThan(40)
    expect(nameKey(1, 'jo smith', true)).not.toBe(nameKey(2, 'jo smith', true))
    expect(nameKey(1, 'jo smith', true)).toContain('jo smith')
    expect(globalKey(5)).toContain(':5:')
    expect(nameBucket('x')).toBe(nameBucket('x'))
  })
})

describe('matchPlayers', () => {
  const players = [
    { id: 1, firstName: 'Jo', lastName: 'Smith', displayName: 'Jo Smith' },
    { id: 2, firstName: 'Joseph', lastName: 'Smith', preferredName: 'Jo', displayName: 'Joseph Smith' },
    { id: 3, firstName: 'Zoë', lastName: "O'Brien" },
  ]
  it('matches by the shared name key (case, accents, punctuation)', () => {
    expect(matchPlayers('  JO   smith ', players).map((p) => p.id)).toEqual([1, 2])
    expect(matchPlayers('Joseph Smith', players).map((p) => p.id)).toEqual([2])
    expect(matchPlayers("zoe o'brien", players).map((p) => p.id)).toEqual([3])
  })
  it('matches nobody for a blank, partial or oversized name', () => {
    expect(matchPlayers('', players)).toEqual([])
    expect(matchPlayers('Smith', players)).toEqual([])
    expect(matchPlayers('x'.repeat(500), players)).toEqual([])
  })
})
