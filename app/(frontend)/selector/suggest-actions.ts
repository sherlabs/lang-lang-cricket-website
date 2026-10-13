'use server'

import { selectorPaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import type { SaveSheetResult } from '@/lib/selector-team-queries'
import { applySuggestion } from '@/lib/selector-xi-queries'

/**
 * "Use this XI". A public POST, so it calls `requireSelection()` first and hands the verified user to the query module, which
 * re-checks the role, checks every player against the grade's squad and saves a draft through the revision-checked save path.
 * It cannot publish, announce or notify. Nothing here touches the database.
 */
const gameIdOf = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null)
const idOf = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)

export type UseXiInput = { gameId: string; expectedRevision: number; playerIds: number[]; keeperId: number | null; captainId: number | null }

export async function applySuggestedXiAction(input: UseXiInput): Promise<SaveSheetResult> {
  const user = await requireSelection(selectorPaths.teams)
  const gameId = gameIdOf(input?.gameId)
  if (!gameId || !Array.isArray(input.playerIds)) return { ok: false, error: 'Something went wrong. Reload and try again.' }
  const playerIds = input.playerIds.slice(0, 20).map(idOf)
  if (playerIds.some((id) => id == null)) return { ok: false, error: 'Something went wrong. Reload and try again.' }
  return applySuggestion(user, { gameId, expectedRevision: Number(input.expectedRevision), playerIds: playerIds as number[], keeperId: idOf(input.keeperId), captainId: idOf(input.captainId) })
}
