import { and, eq, inArray } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { displayNameFromKey } from '../../../lib/match-store/names'
import { reconcileMatchStore, type ReconcileSummary } from '../../../lib/match-store/reconcile'
import { relinkMatchPlayers, upsertMatchBundle } from '../../../lib/match-store/write'
import { matchTables } from '../../../lib/match-store/db'
import { isSkip, mapMatchBundle, nameKeyOf } from '../../../lib/playhq/match-rows'
import { aggregatePlayers } from '../../../lib/playhq/players'
import { mapScorecard } from '../../../lib/playhq/scorecard'
import type { TeamAggregate } from '../../../lib/players/plan'
import { slugify } from '../../../lib/slugify'
import { generateMatchSeed, MATCH_SEED_ALIAS, MATCH_SEED_CLUB_PLAYERS, MATCH_SEED_FILL_IN, MATCH_SEED_HIDDEN_KEY } from './match-seed-data'

/**
 * Writes the deterministic match seed through the real write path (`upsertMatchBundle`), creating the
 * invented club players and their aliases first, exactly like the sync does (raw drizzle, source
 * `playhq`). Shared by `seed:demo` and the int tests. Idempotent per game (unchanged hash, no write).
 */
export type SeedMatchesResult = { games: number; created: number; updated: number; unchanged: number; skipped: number; players: number; aliases: number }

export async function seedMatchStore(payload: Payload, opts: { clubOrgId: string }): Promise<SeedMatchesResult> {
  const t = matchTables(payload)
  const db = payload.db.drizzle
  const games = generateMatchSeed(opts.clubOrgId)

  // 1. Players and aliases for every club name key in the seed.
  const keys = new Set<string>()
  for (const g of games) {
    const clubTeam = g.raw.teams.find((x) => x.organisation.id === opts.clubOrgId)!.id
    for (const a of g.raw.appearances) if (a.teamId === clubTeam && a.roleType === 'Player') keys.add(nameKeyOf(a))
  }
  const canonical = (k: string) => (k === MATCH_SEED_ALIAS.nameKey ? MATCH_SEED_ALIAS.canonicalKey : k)
  const existing: { nameKey: string; player: number }[] = await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases).where(inArray(t.player_aliases.nameKey, [...keys]))
  const idByKey = new Map(existing.map((r) => [r.nameKey, r.player]))
  const slugs = new Set<string>((await db.select({ slug: t.players.slug }).from(t.players)).map((r: { slug: string | null }) => r.slug).filter((x: string | null): x is string => !!x))
  const stamp = new Date().toISOString()
  let players = 0
  for (const key of [...new Set([...keys].map(canonical))]) {
    if (idByKey.has(key)) continue
    const person = [...MATCH_SEED_CLUB_PLAYERS, MATCH_SEED_FILL_IN].find((p) => nameKeyOf(p) === key)!
    let slug = slugify(`${person.firstName} ${person.lastName}`)
    for (let n = 2; slugs.has(slug); n++) slug = `${slugify(`${person.firstName} ${person.lastName}`)}-${n}`
    slugs.add(slug)
    const [row] = await db
      .insert(t.players)
      .values({
        slug, firstName: person.firstName, lastName: person.lastName, displayName: displayNameFromKey(key), source: 'playhq', bio: '', manualYears: '',
        isActiveDerived: false, hidden: key === MATCH_SEED_HIDDEN_KEY, createdAt: stamp, updatedAt: stamp,
      })
      .returning({ id: t.players.id })
    idByKey.set(key, row.id)
    players++
  }
  const aliasRows = [...keys].filter((k) => !existing.some((e) => e.nameKey === k)).map((k) => ({ nameKey: k, player: idByKey.get(canonical(k))!, createdAt: stamp, updatedAt: stamp }))
  if (aliasRows.length) await db.insert(t.player_aliases).values(aliasRows).onConflictDoNothing({ target: t.player_aliases.nameKey })
  const aliasMap = new Map<string, number>((await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases).where(inArray(t.player_aliases.nameKey, [...keys]))).map((r: { nameKey: string; player: number }) => [r.nameKey, r.player]))

  // 2. The games, through the real mapper and writer.
  const out: SeedMatchesResult = { games: games.length, created: 0, updated: 0, unchanged: 0, skipped: 0, players, aliases: aliasRows.length }
  const clubIds = new Set(games.map((g) => g.raw.teams.find((x) => x.organisation.id === opts.clubOrgId)!.id))
  for (const g of games) {
    const bundle = mapMatchBundle(g.raw, {
      clubOrgId: opts.clubOrgId, clubIds, seasonName: g.seasonName, seasonStartYear: g.seasonStartYear, competitionName: g.competitionName,
      isJunior: false, fixture: g.fixture,
    })
    if (isSkip(bundle)) {
      out.skipped++
      continue
    }
    out[await upsertMatchBundle(payload, bundle, aliasMap)]++
  }
  await relinkMatchPlayers(payload)

  // 3. Players who played in the newest seeded season show as active on the site.
  const newest = games.filter((g) => g.seasonStartYear === Math.max(...games.map((x) => x.seasonStartYear)))
  const activeKeys = new Set(newest.flatMap((g) => g.raw.appearances.filter((a) => a.teamId === g.raw.teams.find((x) => x.organisation.id === opts.clubOrgId)!.id && a.roleType === 'Player').map((a) => canonical(nameKeyOf(a)))))
  const activeIds = [...activeKeys].map((k) => idByKey.get(k)).filter((x): x is number => x !== undefined)
  if (activeIds.length) await db.update(t.players).set({ isActiveDerived: true, updatedAt: stamp }).where(and(eq(t.players.source, 'playhq'), inArray(t.players.id, activeIds)))
  return out
}

/** The season aggregates the sync would plan for the seeded games, as `TeamAggregate`s (for the reconciliation). */
export function seedAggregates(clubOrgId: string): TeamAggregate[] {
  const games = generateMatchSeed(clubOrgId)
  const groups = new Map<string, typeof games>()
  for (const g of games) groups.set(`${g.seasonName}|${g.raw.teams.find((x) => x.organisation.id === clubOrgId)!.id}`, [...(groups.get(`${g.seasonName}|${g.raw.teams.find((x) => x.organisation.id === clubOrgId)!.id}`) ?? []), g])
  return [...groups.values()].map((group, order) => {
    const teamId = group[0].raw.teams.find((x) => x.organisation.id === clubOrgId)!.id
    const stats = aggregatePlayers(group.map((g) => mapScorecard(g.raw, clubOrgId, false)), teamId, false)
    return { seasonName: group[0].seasonName, seasonOrder: order, teamId, teamName: 'Seed A Grade', gradeName: 'Seed A Grade', stats }
  })
}

export async function reconcileSeed(payload: Payload, clubOrgId: string): Promise<ReconcileSummary> {
  const t = matchTables(payload)
  const aliases: { nameKey: string; player: number }[] = await payload.db.drizzle.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases)
  return reconcileMatchStore(payload, { aggregates: seedAggregates(clubOrgId), aliasMap: new Map(aliases.map((a) => [a.nameKey, a.player])), skipPairs: new Set() })
}
