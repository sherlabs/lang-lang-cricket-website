import type { Player, PlayerSeason } from '@/db/schema'
import { combineCounts, pickCounts, type SeasonCounts } from './season-math'

type P = Pick<Player, 'photoUrl' | 'bio' | 'isActiveDerived'>

export type MergePlan = {
  targetPatch: { photoUrl?: string; bio?: string; isActiveDerived: boolean }
  /** Source rows for teams the target never played in — reassigned to the target. */
  moveSeasonIds: number[]
  /** Same teamId on both sides: update the target row with the combined counts, delete the source row. */
  combine: { targetRowId: number; sourceRowId: number; counts: SeasonCounts }[]
}

/**
 * How to fold `source` into `target`. Season rows are unique per (player, team), so a team both
 * played for is combined into one row. Photo and bio only fill gaps; derived activity is OR-ed.
 */
export function planMerge(source: P, target: P, sourceSeasons: PlayerSeason[], targetSeasons: PlayerSeason[]): MergePlan {
  const targetByTeam = new Map(targetSeasons.map((r) => [r.teamId, r]))
  const plan: MergePlan = {
    targetPatch: { isActiveDerived: source.isActiveDerived || target.isActiveDerived },
    moveSeasonIds: [],
    combine: [],
  }
  if (!target.photoUrl && source.photoUrl) plan.targetPatch.photoUrl = source.photoUrl
  if (!target.bio && source.bio) plan.targetPatch.bio = source.bio
  for (const r of sourceSeasons) {
    const t = targetByTeam.get(r.teamId)
    if (t) plan.combine.push({ targetRowId: t.id, sourceRowId: r.id, counts: combineCounts(pickCounts(t), pickCounts(r)) })
    else plan.moveSeasonIds.push(r.id)
  }
  return plan
}
