import { describe, expect, it } from 'vitest'
import { planMerge } from '@/lib/players/merge'
import { buildMergeSnapshot, revertTargetPatch, type SnapshotPlayer } from '@/lib/players/merge-snapshot'
import { EMPTY_COUNTS } from '@/lib/players/season-math'

const source = { id: 5, slug: 'jon-smith', firstName: 'Jon', lastName: 'Smith', photo: 7, bio: 'Opener.', isActiveDerived: true } as SnapshotPlayer
const targetBefore = { photo: null as number | null, bio: '', isActiveDerived: false }

function snapshot() {
  const plan = planMerge({ photo: 7, bio: 'Opener.', isActiveDerived: true }, targetBefore, [{ id: 1, teamId: 'A', ...EMPTY_COUNTS }], [])
  return buildMergeSnapshot({
    source, aliases: [{ id: 9, nameKey: 'jon|smith' }, { id: 4, nameKey: 'j|smith' }],
    honours: [{ id: 22, _order: 2, years: '2020', title: 'B' }, { id: 21, _order: 1, years: '2019', title: 'A' }],
    targetMaxHonourOrder: 3, targetBefore, plan, peopleIds: [8, 3], playerSponsorIds: [12], 
  })
}

describe('merge snapshot', () => {
  it('holds identity only, ordered, and nothing about seasons or appearances', () => {
    const s = snapshot()
    expect(Object.keys(s).sort()).toEqual(['aliases', 'honours', 'peopleIds', 'playerSponsorIds', 'source', 'targetBefore', 'targetMaxHonourOrder', 'targetMerged', 'version'])
    expect(s.aliases.map((a) => a.id)).toEqual([4, 9])
    expect(s.honours.map((h) => h.order)).toEqual([1, 2])
    expect(s.peopleIds).toEqual([3, 8])
    expect(JSON.stringify(s)).not.toMatch(/season|appearance/i)
    expect(JSON.stringify(s).length).toBeLessThan(4000)
  })

  it('records what planMerge writes to the target, so nothing the merge changes is missing', () => {
    const plan = planMerge({ photo: 7, bio: 'Opener.', isActiveDerived: true }, targetBefore, [], [])
    const s = snapshot()
    expect(s.targetMerged).toEqual(plan.targetPatch)
    for (const key of Object.keys(plan.targetPatch)) expect(s.targetBefore).toHaveProperty(key)
  })

  it('reverts a target field only while it still holds the merged value', () => {
    const s = snapshot()
    expect(revertTargetPatch(s, { photo: 7, bio: 'Opener.', isActiveDerived: true })).toEqual({ photo: null, bio: '', isActiveDerived: false })
    // The editor changed the bio and photo since: keep their edits.
    expect(revertTargetPatch(s, { photo: 99, bio: 'Edited.', isActiveDerived: true })).toEqual({ isActiveDerived: false })
    // The sync recomputed the flag: leave it.
    expect(revertTargetPatch(s, { photo: 7, bio: 'Opener.', isActiveDerived: false })).toEqual({ photo: null, bio: '' })
  })

  it('does not touch a field the merge did not change', () => {
    const plan = planMerge({ photo: 7, bio: 'x', isActiveDerived: false }, { photo: 8, bio: 'mine', isActiveDerived: false }, [], [])
    const s = buildMergeSnapshot({ source, aliases: [], honours: [], targetMaxHonourOrder: 0, targetBefore: { photo: 8, bio: 'mine', isActiveDerived: false }, plan, peopleIds: [], playerSponsorIds: [] })
    expect(revertTargetPatch(s, { photo: 8, bio: 'mine', isActiveDerived: false })).toEqual({})
  })
})
