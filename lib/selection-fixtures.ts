import type { Payload } from 'payload'
import { CLUB_TIMEZONE } from '@/config/site'
import { getClubGames, isJuniorGrade, resolveSeason } from '@/lib/playhq/queries'
import type { ClubTeam, Game } from '@/lib/playhq/types'
import { gameToFixture, planFixtureUpsert, type FixtureInput, type StoredFixture } from '@/lib/selection/fixtures-plan'

/**
 * Refreshing the stored selection fixtures from PlayHQ (announce-teams spec 4.3). Reads the same cached path `/fixtures` uses
 * (`getClubGames`), keeps senior games only, upserts by `gameId` and never deletes. Triggers: the nightly players-sync cron and the
 * selector area's "Refresh fixtures" button. Runs with the Local API's access override, so callers must have checked the role.
 */
export type FixtureSource = () => Promise<{ games: Game[]; teams: Pick<ClubTeam, 'id' | 'name' | 'isJunior'>[] }>

export const defaultFixtureSource: FixtureSource = async () => {
  const { season } = await resolveSeason(undefined)
  if (!season || season.isJunior) return { games: [], teams: [] }
  return getClubGames(season)
}

export type RefreshResult = { created: number; updated: number; moved: number; removed: number; kept: number; skipped: number }

/** Today's date (YYYY-MM-DD) in club time. */
export const clubToday = (now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIMEZONE }).format(now)

export async function refreshSelectionFixtures(payload: Payload, opts: { source?: FixtureSource; now?: Date } = {}): Promise<RefreshResult> {
  const now = opts.now ?? new Date()
  const { games, teams } = await (opts.source ?? defaultFixtureSource)()
  const byTeam = new Map(teams.filter((t) => !t.isJunior).map((t) => [t.id, t]))
  const incoming: FixtureInput[] = []
  for (const g of games) {
    if (g.gradeName && isJuniorGrade(g.gradeName)) continue
    const row = gameToFixture(g, byTeam.get(g.club.id))
    if (row) incoming.push(row)
  }
  const stored = (await payload.find({ collection: 'selection-fixtures', limit: 2000, depth: 0, pagination: false, overrideAccess: true })).docs as unknown as StoredFixture[]
  const plan = planFixtureUpsert(incoming, stored, clubToday(now))
  const ctx = { disableRevalidate: true }
  const syncedAt = now.toISOString()
  for (const row of plan.create) await payload.create({ collection: 'selection-fixtures', data: { ...row, syncedAt } as never, overrideAccess: true, context: ctx })
  for (const u of plan.update) await payload.update({ collection: 'selection-fixtures', id: u.id, data: { ...u.data, syncedAt, ...(u.moved ? { movedAt: syncedAt } : {}) } as never, overrideAccess: true, context: ctx })
  for (const id of plan.remove) await payload.update({ collection: 'selection-fixtures', id, data: { status: 'removed', syncedAt } as never, overrideAccess: true, context: ctx })
  return { created: plan.create.length, updated: plan.update.length, moved: plan.update.filter((u) => u.moved).length, removed: plan.remove.length, kept: plan.kept, skipped: plan.skippedOutOfWindow }
}
