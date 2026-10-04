import type { MergePlan } from './merge'
import type { SeasonCounts } from './season-math'

/**
 * Identity-only snapshot taken inside the merge transaction before any write (W2 spec 6.2). The sync deletes and re-inserts
 * season rows nightly and replaces match children wholesale, so recorded season or appearance ids would not survive one sync and
 * restoring counts would overwrite fresher numbers with stale ones. The snapshot therefore holds only what an undo needs to
 * bring the source identity back: the player row, its aliases, its honours, the links that pointed at it, and the target's
 * pre-merge photo, bio and active flag. A few kilobytes.
 *
 * One exception: season rows with `source = 'import'`. The sync never recreates imported history (it only replaces its own
 * rows), so those are recorded too: the full source row when it was combined into a target row (with the target's counts
 * before and after), and the ids of the rows that were simply moved. An undo puts them back; PlayHQ rows still come from the next sync.
 */
export type SnapshotPlayer = Record<string, unknown> & { id: number; slug: string; firstName: string; lastName: string }
export type MergeSnapshot = {
  version: 1
  source: SnapshotPlayer
  aliases: { id: number; nameKey: string }[]
  honours: { id: number; order: number; years: string | null; title: string }[]
  /** Highest `_order` of the target's own honours when the merge ran (source honours were appended after it). */
  targetMaxHonourOrder: number
  targetBefore: { photo: number | null; bio: string; isActiveDerived: boolean }
  /** What the merge wrote to the target, so an undo reverts a field only while it still holds the merged value. */
  targetMerged: { photo?: number; bio?: string; isActiveDerived: boolean }
  peopleIds: number[]
  playerSponsorIds: number[]
  importedSeasons?: ImportedSeasonsSnapshot
}

export type ImportedSeasonsSnapshot = {
  /** Imported source rows moved to the target unchanged. */
  movedIds: number[]
  /** Imported source rows folded into a target row: the whole row (deleted by the merge), and the target row's counts before and after. */
  combined: { sourceRow: Record<string, unknown> & { id: number }; targetRowId: number; targetBefore: SeasonCounts; targetMerged: SeasonCounts }[]
}

export type SnapshotInput = {
  source: SnapshotPlayer
  aliases: { id: number; nameKey: string }[]
  honours: { id: number; _order: number; years: string | null; title: string }[]
  targetMaxHonourOrder: number
  targetBefore: MergeSnapshot['targetBefore']
  plan: Pick<MergePlan, 'targetPatch'>
  peopleIds: number[]
  playerSponsorIds: number[]
  importedSeasons?: ImportedSeasonsSnapshot
}

export function buildMergeSnapshot(i: SnapshotInput): MergeSnapshot {
  return {
    version: 1,
    source: i.source,
    aliases: i.aliases.map((a) => ({ id: a.id, nameKey: a.nameKey })).sort((a, b) => a.id - b.id),
    honours: i.honours.map((h) => ({ id: h.id, order: h._order, years: h.years, title: h.title })).sort((a, b) => a.order - b.order),
    targetMaxHonourOrder: i.targetMaxHonourOrder,
    targetBefore: i.targetBefore,
    targetMerged: { ...i.plan.targetPatch },
    peopleIds: [...i.peopleIds].sort((a, b) => a - b),
    playerSponsorIds: [...i.playerSponsorIds].sort((a, b) => a - b),
    ...(i.importedSeasons && (i.importedSeasons.movedIds.length || i.importedSeasons.combined.length) ? { importedSeasons: i.importedSeasons } : {}),
  }
}

export type TargetNow = { photo: number | null; bio: string; isActiveDerived: boolean }

/** The target patch that reverts the merge, only for fields still equal to what the merge wrote. */
export function revertTargetPatch(s: MergeSnapshot, now: TargetNow): Partial<{ photo: number | null; bio: string; isActiveDerived: boolean }> {
  const patch: Partial<{ photo: number | null; bio: string; isActiveDerived: boolean }> = {}
  if (s.targetMerged.photo !== undefined && now.photo === s.targetMerged.photo) patch.photo = s.targetBefore.photo
  if (s.targetMerged.bio !== undefined && now.bio === s.targetMerged.bio) patch.bio = s.targetBefore.bio
  if (now.isActiveDerived === s.targetMerged.isActiveDerived && s.targetBefore.isActiveDerived !== s.targetMerged.isActiveDerived) patch.isActiveDerived = s.targetBefore.isActiveDerived
  return patch
}
