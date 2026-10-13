import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { matchTables } from '@/lib/match-store/db'
import { writeBundle } from '@/lib/match-store/write'
import type { MatchBundle } from '@/lib/playhq/match-rows'
import { mkBundle, type BundleSpec } from '../match-facts-helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'
import { getFactsFor } from '@/lib/match-store/stats-queries'
import { setPrice, setUpSeason, openSeason } from '@/lib/fantasy/admin'
import type { FantasySeason } from '@/lib/fantasy/store'
import { currentSeasonStartYear } from '@/lib/selection/season'

const CTX = { disableRevalidate: true } as const
const DAY = 86_400_000

/** A Saturday `weeks` weeks from the Saturday on or after today (negative for the past). Never today, so "past" and "future" are clear. */
export function saturday(weeks: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const add = (6 - d.getUTCDay() + 7) % 7 || 7
  return new Date(d.getTime() + (add + weeks * 7) * DAY).toISOString().slice(0, 10)
}

export async function resetFantasy(payload: Payload): Promise<void> {
  await resetSelection(payload)
  await payload.db.drizzle.execute(sql.raw('TRUNCATE "payload"."fantasy_squads_picks", "payload"."fantasy_squads", "payload"."fantasy_entries", "payload"."fantasy_prices", "payload"."fantasy_round_state", "payload"."fantasy_seasons", "payload"."fantasy_seasons_texts" RESTART IDENTITY CASCADE'))
  await payload.db.drizzle.execute(sql.raw('DELETE FROM "payload"."site_settings"'))
}

/** Players c1..cN in a current squad (so eligible), with ids by label. */
export async function makeClubPlayers(payload: Payload, n: number, extra: Record<string, Record<string, unknown>> = {}): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (let i = 1; i <= n; i++) {
    const who = `c${i}`
    const p = await makePlayer(payload, `Player${i}`, `Test${i}`, { slug: `player-${i}`, ...(extra[who] ?? {}) })
    out[who] = p.id
  }
  return out
}

/** Stores one FINAL game (a `mkBundle` spec) whose club side players are the labels in `ids`. */
export async function storeGame(payload: Payload, spec: BundleSpec, ids: Record<string, number>): Promise<void> {
  const b = mkBundle(spec)
  const bundle = { ...b, sourceHash: `h-${spec.gameId ?? 'g'}`, warnings: [] } as unknown as MatchBundle
  const alias = new Map(Object.entries(ids).map(([who, id]) => [`club|${who}`, id]))
  const t = matchTables(payload)
  await payload.db.drizzle.transaction(async (tx) => {
    await writeBundle(tx, t, bundle, alias, { source: 'playhq' })
  })
}

/** A selection fixture on `date` starting at `startsAt`. */
export async function fixtureOn(payload: Payload, gameId: string, date: string, startsAt: string, status = 'upcoming') {
  return makeFixture(payload, { gameId, localDate: date, startsAt, status })
}

export const startOn = (date: string, hour = 3): string => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`

export async function makeUser(payload: Payload, role: 'admin' | 'editor' | 'selector', email = `${role}@example.com`) {
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return found.docs[0]
  return payload.create({ collection: 'users', data: { email, password: `${role}-pass-123`, role, name: `${role} person` } as never, context: { seedAdmin: true, ...CTX } })
}


export type World = {
  admin: Awaited<ReturnType<typeof makeUser>>
  editor: Awaited<ReturnType<typeof makeUser>>
  season: FantasySeason
  ids: Record<string, number>
  sat1: string
  sat2: string
  sat3: string
  sat4: string
}

/**
 * A small club: 12 senior players in a squad (c1..c12), one junior (c13) with a big score and one hidden player (c14), two played
 * weekends in the match store (one with an abandoned game), two upcoming weekends, an open season with every price at 8.0 and the
 * competition switched on. Needs `vi.mock('next/cache', ...)` in the calling file.
 */
export async function buildWorld(payload: Payload): Promise<World> {
  await resetFantasy(payload)
  const admin = await makeUser(payload, 'admin')
  const editor = await makeUser(payload, 'editor')
  const year = currentSeasonStartYear()
  const [sat1, sat2, sat3, sat4] = [saturday(-3), saturday(-2), saturday(0), saturday(1)]
  const ids = await makeClubPlayers(payload, 14, { c13: { isJunior: true }, c14: { hidden: true } })
  const squad = await makeSquad(payload, year)
  for (let i = 1; i <= 12; i++) await addToSquad(payload, squad.id, ids[`c${i}`])
  await storeGame(payload, {
    gameId: 'g1', season: year, date: sat1,
    innings: [
      { seq: 1, clubBatting: true, bat: [
        { who: 'c1', pos: 1, status: 'out', runs: 0, fours: 0, sixes: 0, dismissal: 'bowled' },
        { who: 'c2', pos: 2, status: 'out', runs: 30, fours: 2, sixes: 1, dismissal: 'lbw' },
        { who: 'c3', pos: 3, status: 'not_out', runs: 12, fours: null, sixes: null },
        { who: 'c13', pos: 4, status: 'not_out', runs: 100, fours: 0, sixes: 0 },
        { who: 'c14', pos: 5, status: 'not_out', runs: 90, fours: 0, sixes: 0 },
      ] },
      { seq: 2, clubBatting: false, bat: [
        { who: 'o1', pos: 1, status: 'out', dismissal: 'bowled', bowler: 'c4' },
        { who: 'o2', pos: 2, status: 'out', dismissal: 'caught', bowler: 'c4', fielder: 'c5' },
        { who: 'o3', pos: 3, status: 'out', dismissal: 'bowled', bowler: 'c4' },
      ], bowl: [{ who: 'c4', wickets: 3, maidens: 1 }] },
    ],
    extra: ['c6'],
  }, ids)
  await storeGame(payload, { gameId: 'g2', season: year, date: sat2, result: 'abandoned', innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, status: 'out', runs: 99, fours: 0, sixes: 0, dismissal: 'bowled' }] }] }, ids)
  await storeGame(payload, { gameId: 'g3', season: year, date: sat2, innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c2', pos: 1, status: 'out', runs: 0, fours: 0, sixes: 0, dismissal: 'bowled' }, { who: 'c6', pos: 2, status: 'out', runs: 60, fours: 4, sixes: 0, dismissal: 'lbw' }] }] }, ids)
  await fixtureOn(payload, 'g1', sat1, startOn(sat1), 'final')
  await fixtureOn(payload, 'g2', sat2, startOn(sat2))
  await fixtureOn(payload, 'g3', sat2, startOn(sat2, 5), 'final')
  await fixtureOn(payload, 'g4', sat3, startOn(sat3))
  await fixtureOn(payload, 'g5', sat4, startOn(sat4))
  const made = await setUpSeason(payload, admin, { year, name: `${year} season`, facts: await getFactsFor([year]) })
  if (!made.ok) throw new Error(made.message)
  for (let i = 1; i <= 12; i++) await setPrice(payload, admin, made.season, ids[`c${i}`], 80)
  const opened = await openSeason(payload, admin, made.season)
  if (!opened.ok) throw new Error(opened.message)
  await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { enabled: true } } as never, overrideAccess: true, context: CTX })
  return { admin, editor, season: opened.season, ids, sat1, sat2, sat3, sat4 }
}
