import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { matchTables } from '@/lib/match-store/db'
import { writeBundle } from '@/lib/match-store/write'
import type { MatchBundle } from '@/lib/playhq/match-rows'
import { mkBundle, type BundleSpec } from '../match-facts-helpers'
import { makeFixture, makePlayer, resetSelection } from './selection-helpers'

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
