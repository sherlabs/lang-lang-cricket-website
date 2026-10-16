import type { PlayerSeason } from '@/lib/domain'
import { combineCounts, pickCounts, type SeasonCounts } from './season-math'

/** The merge-relevant fields of a Payload player doc (`photo` = media id at depth 0). */
type P = { photo: number | null; bio: string; isActiveDerived: boolean; isJunior?: boolean; socialOptIn?: boolean }
type Row = Pick<PlayerSeason, 'id' | 'teamId'> & SeasonCounts

export type MergePlan = {
  /** `isJunior` / `socialOptIn` appear only when the merge changes the target's value (see `planMerge`). */
  targetPatch: { photo?: number; bio?: string; isActiveDerived: boolean; isJunior?: boolean; socialOptIn?: boolean }
  /** Source rows for teams the target never played in — reassigned to the target. */
  moveSeasonIds: number[]
  /** Same teamId on both sides: update the target row with the combined counts, delete the source row. */
  combine: { targetRowId: number; sourceRowId: number; counts: SeasonCounts }[]
}

/**
 * How to fold `source` into `target`. Season rows are unique per (player, team), so a team both
 * played for is combined into one row. Photo and bio only fill gaps; derived activity is OR-ed.
 * The social-media safeguards only ever tighten: `isJunior` is OR-ed (a junior merged into an adult record stays a junior) and
 * `socialOptIn` is AND-ed (the consent must have been given for both records), so a merge can never make a child eligible for a post.
 */
export function planMerge(source: P, target: P, sourceSeasons: Row[], targetSeasons: Row[]): MergePlan {
  const targetByTeam = new Map(targetSeasons.map((r) => [r.teamId, r]))
  const plan: MergePlan = {
    targetPatch: { isActiveDerived: source.isActiveDerived || target.isActiveDerived },
    moveSeasonIds: [],
    combine: [],
  }
  if (source.isJunior && !target.isJunior) plan.targetPatch.isJunior = true
  if (target.socialOptIn && !source.socialOptIn) plan.targetPatch.socialOptIn = false
  if (!target.photo && source.photo) plan.targetPatch.photo = source.photo
  if (!target.bio && source.bio) plan.targetPatch.bio = source.bio
  for (const r of sourceSeasons) {
    const t = targetByTeam.get(r.teamId)
    if (t) plan.combine.push({ targetRowId: t.id, sourceRowId: r.id, counts: combineCounts(pickCounts(t), pickCounts(r)) })
    else plan.moveSeasonIds.push(r.id)
  }
  return plan
}
