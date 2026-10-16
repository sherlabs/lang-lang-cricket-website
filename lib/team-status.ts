import { balanceCounts } from './selection/roles'
import { sameAsSnapshot, type Slot, type Snapshot, type XiSize } from './selection/team-sheet'
import type { Warning, WarnSlot } from './selection/warnings'

/**
 * The status chip of a team sheet (announce-teams spec 5.1): Not started, In progress, Ready or Needs attention. "Published" is a
 * separate chip. Pure, so the all-teams view, the overview and the tests agree.
 */
export type TeamStatus = 'not-started' | 'in-progress' | 'ready' | 'needs-attention'
export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = { 'not-started': 'Not started', 'in-progress': 'In progress', ready: 'Ready', 'needs-attention': 'Needs attention' }

export function deriveTeamStatus(i: { slotCount: number; size: XiSize; markedReady: boolean; warnings: readonly Warning[]; slots: readonly Pick<WarnSlot, 'role' | 'isKeeper' | 'isCaptain'>[] }): TeamStatus {
  if (i.slotCount === 0) return 'not-started'
  if (i.warnings.some((w) => w.blocking || w.strong)) return 'needs-attention'
  const full = i.size === 0 || i.slotCount >= i.size
  const hasCaptain = i.slots.some((s) => s.isCaptain)
  const hasKeeper = balanceCounts(i.slots).keepers > 0
  if (i.markedReady && full && hasCaptain && hasKeeper) return 'ready'
  return 'in-progress'
}

export type PublishChip = 'published' | 'published-changed' | null
export const PUBLISH_CHIP_LABEL: Record<Exclude<PublishChip, null>, string> = { published: 'Published', 'published-changed': 'Published, changes not published' }

export function publishChip(sheet: { slots: readonly Slot[]; size: XiSize }, snapshot: Snapshot | null): PublishChip {
  if (!snapshot) return null
  return sameAsSnapshot(sheet, snapshot) ? 'published' : 'published-changed'
}
