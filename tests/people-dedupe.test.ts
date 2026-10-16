import { describe, expect, it } from 'vitest'
import { planDedupe, pickPrimary, type DedupeRow } from '../payload/scripts/dedupe-people-lib'

const row = (o: Partial<DedupeRow> & { id: number }): DedupeRow => ({
  name: 'Russell Savige', role: 'Role', section: 'committee', moreRoles: [], phone: '', email: '', photoId: null, playerId: null, ...o,
})

describe('planDedupe', () => {
  it('prefers the row with a photo, then more fields, then the lowest id', () => {
    expect(pickPrimary([row({ id: 1, phone: '1' }), row({ id: 2, photoId: 9 })]).id).toBe(2)
    expect(pickPrimary([row({ id: 3 }), row({ id: 2, phone: '1' })]).id).toBe(2)
    expect(pickPrimary([row({ id: 5 }), row({ id: 4 })]).id).toBe(4)
  })

  it('groups on trimmed, space-collapsed, case-insensitive names and merges roles and empty fields', () => {
    const [g] = planDedupe([
      row({ id: 7, role: 'Senior Leadership Team', section: 'leadership', photoId: 3 }),
      row({ id: 12, name: '  russell   SAVIGE ', role: 'First Aid Officer', phone: '0400 111 222', playerId: 14 }),
      row({ id: 20, name: 'Someone Else' }),
    ])
    expect(g).toMatchObject({ keepId: 7, mergedIds: [12], skipped: false })
    expect(g!.copied.map((c) => c.field)).toEqual(['phone', 'player link'])
    expect(g!.update.moreRoles).toEqual([{ role: 'First Aid Officer', section: 'committee' }])
  })

  it('skips exact duplicate roles and roles equal to the primary', () => {
    const [g] = planDedupe([
      row({ id: 1, role: 'Treasurer', section: 'committee', photoId: 1, moreRoles: [{ role: 'Coach', section: 'coach' }] }),
      row({ id: 2, role: 'treasurer', section: 'committee' }),
      row({ id: 3, role: 'Coach', section: 'coach' }),
    ])
    expect(g!.update.moreRoles).toEqual([{ role: 'Coach', section: 'coach' }])
    expect(g!.skippedRoles).toHaveLength(2)
  })

  it('reports a conflict and skips the group unless preferPrimary', () => {
    const rows = [row({ id: 1, photoId: 1, phone: '0400 111 111' }), row({ id: 2, phone: '0400 999 999', role: 'Other' })]
    const [g] = planDedupe(rows)
    expect(g!.skipped).toBe(true)
    expect(g!.conflicts.map((c) => c.field)).toEqual(['phone'])
    const [p] = planDedupe(rows, { preferPrimary: true })
    expect(p!.skipped).toBe(false)
    expect(p!.update.phone).toBeUndefined()
  })

  it('treats spacing/case-only differences as the same value', () => {
    const [g] = planDedupe([row({ id: 1, phone: '0400 111 111', email: 'A@x.com' }), row({ id: 2, phone: '0400111111', email: 'a@x.com', role: 'B' })])
    expect(g!.conflicts).toEqual([])
  })
})
