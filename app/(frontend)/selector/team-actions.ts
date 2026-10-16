'use server'

import { selectorPaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import { publishSheets, saveSheet, withdrawSheet, type PublishResult, type SaveSheetResult, type WithdrawResult } from '@/lib/selector-team-queries'

/**
 * Server actions for team selection. Every one is a public POST, so each calls `requireSelection()` first and hands the verified
 * user to `lib/selector-team-queries.ts`, which re-checks the role, validates with the pure functions and derives who did it from
 * that user (a forged `updatedBy` or `publishedBy` in the input is never read). Nothing here touches the database.
 */
const gameIdOf = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null)
const BAD = 'Something went wrong. Reload and try again.'

export type SaveTeamInput = { gameId: string; expectedRevision: number; size: number; markedReady: boolean; slots: { playerId?: number | null; guestName?: string | null; isCaptain?: boolean; isKeeper?: boolean }[] }

export async function saveTeamAction(input: SaveTeamInput): Promise<SaveSheetResult> {
  const user = await requireSelection(selectorPaths.teams)
  const gameId = gameIdOf(input?.gameId)
  if (!gameId || !Array.isArray(input.slots)) return { ok: false, error: BAD }
  return saveSheet(user, { gameId, expectedRevision: Number(input.expectedRevision), size: input.size, markedReady: input.markedReady === true, slots: input.slots.slice(0, 30).map((s) => ({ playerId: typeof s?.playerId === 'number' ? s.playerId : null, guestName: typeof s?.guestName === 'string' ? s.guestName : null, isCaptain: s?.isCaptain === true, isKeeper: s?.isKeeper === true })) })
}

export type PublishTeamsInput = { gameIds: string[]; announce: boolean; acknowledged: boolean; expectedRevisions?: Record<string, number>; requireReady?: boolean }

export async function publishTeamsAction(input: PublishTeamsInput): Promise<PublishResult> {
  const user = await requireSelection(selectorPaths.teams)
  const ids = Array.isArray(input?.gameIds) ? input.gameIds.map(gameIdOf).filter((g): g is string => g != null) : []
  if (!ids.length) return { ok: false, error: BAD }
  const expected: Record<string, number> = {}
  for (const [k, v] of Object.entries(input.expectedRevisions ?? {})) if (gameIdOf(k) && Number.isInteger(v)) expected[k] = v
  return publishSheets(user, { gameIds: ids, announce: input.announce === true, acknowledged: input.acknowledged === true, expectedRevisions: Object.keys(expected).length ? expected : undefined, requireReady: input.requireReady === true })
}

export async function withdrawTeamAction(input: { gameId: string }): Promise<WithdrawResult> {
  const user = await requireSelection(selectorPaths.teams)
  const gameId = gameIdOf(input?.gameId)
  if (!gameId) return { ok: false, error: BAD }
  return withdrawSheet(user, gameId)
}
