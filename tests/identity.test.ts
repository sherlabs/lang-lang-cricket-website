import { describe, expect, it } from 'vitest'
import { initials, normaliseName, resolvePhotoUrl, resolvePlayerIdentity } from '../lib/identity'
import { planLinks } from '../lib/people-link-plan'

describe('photo and identity resolver', () => {
  it('takes the first non-empty photo, else empty (initials)', () => {
    expect(resolvePhotoUrl('/player.jpg', '/person.jpg')).toBe('/player.jpg')
    expect(resolvePhotoUrl('', '/person.jpg')).toBe('/person.jpg')
    expect(resolvePhotoUrl(undefined, null, '  ', '/c.jpg')).toBe('/c.jpg')
    expect(resolvePhotoUrl('', null, undefined)).toBe('')
    expect(resolvePhotoUrl()).toBe('')
  })

  it("keeps the player's name and photo, borrows the person's photo when the player has none, exposes the role", () => {
    const person = { id: 1, name: 'Russ S', role: ' President ', section: 'leadership', photoUrl: '/russ.jpg' }
    expect(resolvePlayerIdentity({ name: 'Russell Savige', photoUrl: '' }, person)).toEqual({ name: 'Russell Savige', photoUrl: '/russ.jpg', clubRole: 'President' })
    expect(resolvePlayerIdentity({ name: 'Russell Savige', photoUrl: '/own.jpg' }, person).photoUrl).toBe('/own.jpg')
    expect(resolvePlayerIdentity({ name: 'Sam', photoUrl: '' }, null)).toEqual({ name: 'Sam', photoUrl: '', clubRole: null })
    expect(resolvePlayerIdentity({ name: 'Sam', photoUrl: '' }, { ...person, photoUrl: '', role: '  ' })).toEqual({ name: 'Sam', photoUrl: '', clubRole: null })
  })

  it('initials: first two words, upper-case; empty for empty', () => {
    expect(initials('russell savige')).toBe('RS')
    expect(initials('  Sam   Taylor  Jr ')).toBe('ST')
    expect(initials('Cher')).toBe('C')
    expect(initials('')).toBe('')
  })

  it('normaliseName folds case, accents, punctuation and spacing', () => {
    expect(normaliseName("  Russell  SAVIGE ")).toBe('russell savige')
    expect(normaliseName("Zoë O'Brien-Smith")).toBe('zoe o brien smith')
  })
})

describe('link plan (people -> players by exact normalised name)', () => {
  const players = [
    { id: 1, name: 'Russell Savige' },
    { id: 2, name: 'Sam Taylor' },
    { id: 3, name: 'Sam  Taylor', hidden: true },
    { id: 4, name: 'Alex Lee' },
    { id: 5, name: 'Pat Quinn' },
  ]

  it('proposes only clean one-to-one exact matches and reports the rest', () => {
    const plan = planLinks(
      [
        { id: 10, name: 'russell savige', playerId: null },
        { id: 11, name: 'Sam Taylor', playerId: null }, // two players share the name
        { id: 12, name: 'Jamie Nobody', playerId: null }, // no player
        { id: 13, name: 'Alex Lee', playerId: 99 }, // already linked
        { id: 14, name: 'Russell Sav', playerId: null }, // near miss: never guessed
        { id: 15, name: 'Pat Quinn', playerId: null },
        { id: 16, name: 'pat quinn', playerId: null }, // two people claim one player
      ],
      players,
    )
    expect(plan.matches.map((m) => [m.personId, m.playerId])).toEqual([[10, 1]])
    expect(plan.ambiguous.map((a) => a.personId).sort()).toEqual([11, 15, 16])
    expect(plan.unmatched.map((u) => u.personId).sort()).toEqual([12, 14])
    expect(plan.alreadyLinked.map((a) => a.personId)).toEqual([13])
  })

  it("does not propose a player who is already someone else's", () => {
    const plan = planLinks([{ id: 1, name: 'Alex Lee', playerId: null }, { id: 2, name: 'A. Lee', playerId: 4 }], players)
    expect(plan.matches).toEqual([])
    expect(plan.ambiguous[0]).toMatchObject({ personId: 1, reason: expect.stringContaining('already linked') })
  })

  it('flags a hidden player on a match', () => {
    const plan = planLinks([{ id: 1, name: 'Hidden Hal', playerId: null }], [{ id: 9, name: 'Hidden Hal', hidden: true }])
    expect(plan.matches[0].playerHidden).toBe(true)
  })
})
