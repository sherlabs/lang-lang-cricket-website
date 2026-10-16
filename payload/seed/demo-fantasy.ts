import type { Payload } from 'payload'
import { PLAYHQ_ORG_ID } from '../../lib/playhq/client'
import { isSkip, mapMatchBundle } from '../../lib/playhq/match-rows'
import { upsertMatchBundle } from '../../lib/match-store/write'
import { matchTables } from '../../lib/match-store/db'
import { readStoredBundles } from '../../lib/match-store/read'
import { wallClockToUtc } from '../../lib/selection/fixtures-plan'
import { weekendKey } from '../../lib/selection/weekend'
import { currentClubDate } from '../../lib/selection/club-date'
import { currentSeasonStartYear } from '../../lib/selection/season'
import { assembleFacts, deriveFacts, mergeFactSets } from '../../lib/stats/match/facts'
import type { FactSet } from '../../lib/stats/match/types'
import { calculatePrices, markRoundScored, openSeason, setUpSeason } from '../../lib/fantasy/admin'
import { registerEntry } from '../../lib/fantasy/join'
import { isBannedPin } from '../../lib/fantasy/pin'
import { getOpenSeason, loadPool, type FantasySeason } from '../../lib/fantasy/store'
import { saveSquad } from '../../lib/fantasy/squads'
import { generateMatchSeed } from '../scripts/fixtures/match-seed-data'

/**
 * Demo club fantasy cricket (wave F spec 4.10), on top of the demo match store and squads: a season for the current year with
 * prices worked out from the stored games of senior players, four finished weekends (two scored, one waiting for a scorecard, one
 * washed out and closed by the committee, plus a forfeit that scores no appearance), eight invented teams with squads for the past
 * rounds, and this week's squads for five of them. The leaderboard is public and the game is switched on. PINs are printed to the
 * console only and never stored in the clear. Idempotent: skipped once any fantasy season exists. Invented names only; no junior
 * is in the pool (the pool is built from the senior filter).
 */
const CTX = { disableRevalidate: true } as const
const DAY = 86_400_000

const TEAMS = ['Boundary Riders', 'Silly Mid-Offs', 'The Yorkers', 'Duck Dynasty', 'Square Leg Legends', 'Maiden Over Heroes', 'Slip Cordon', 'Nightwatchmen']
const PINS = ['482915', '730264', '915372', '264809', '508193', '371628', '846052', '629417']

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The Saturday `weeks` weeks before the next Saturday (club-local `YYYY-MM-DD`), strictly in the past for `weeks >= 2`. */
function pastSaturday(weeks: number, today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  const add = (6 - d.getUTCDay() + 7) % 7 || 7
  return new Date(d.getTime() + (add - weeks * 7) * DAY).toISOString().slice(0, 10)
}

/** Facts of the stored seasons (visible players only), read straight from the match store: the seed has no Next cache. */
async function factsOf(payload: Payload, years: number[]): Promise<FactSet> {
  const players = await payload.find({ collection: 'players', where: { hidden: { equals: false } }, pagination: false, depth: 0, limit: 0, select: { slug: true } })
  const visible = new Set(players.docs.map((p) => p.id))
  const sets: FactSet[] = []
  for (const y of years) {
    const matches = await payload.find({ collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { seasonStartYear: { equals: y } }] }, pagination: false, depth: 0, limit: 0, select: { gameId: true }, overrideAccess: true })
    const bundles = matches.docs.length ? await readStoredBundles(payload, { gameIds: matches.docs.map((m) => String(m.gameId)) }) : []
    sets.push(assembleFacts(bundles.flatMap((b) => { const f = deriveFacts(b, visible); return f ? [f] : [] })))
  }
  return mergeFactSets(sets)
}

/** Re-dated copies of seeded senior games in the current season, so the demo has finished rounds in the season the game runs in. */
async function storeDemoGames(payload: Payload, year: number, plan: { gameId: string; date: string; from: 'normal' | 'forfeit'; index: number }[]): Promise<void> {
  const t = matchTables(payload)
  const aliases: { nameKey: string; player: number }[] = await payload.db.drizzle.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases)
  const aliasMap = new Map(aliases.map((a) => [a.nameKey, a.player]))
  const seeded = generateMatchSeed(PLAYHQ_ORG_ID).filter((g) => g.seasonStartYear === 2025 && g.raw.status === 'FINAL')
  const normal = seeded.filter((g) => !g.edge)
  const forfeit = seeded.filter((g) => g.edge === 'won by forfeit')
  const clubIds = new Set(seeded.map((g) => g.raw.teams.find((x) => x.organisation.id === PLAYHQ_ORG_ID)!.id))
  for (const p of plan) {
    const src = (p.from === 'normal' ? normal : forfeit)[p.index]
    if (!src) continue
    const dateTime = wallClockToUtc(p.date, '13:00:00')
    const raw = { ...src.raw, id: p.gameId, schedule: [{ ...(src.raw.schedule?.[0] ?? {}), dateTime }] } as typeof src.raw
    const bundle = mapMatchBundle(raw, {
      clubOrgId: PLAYHQ_ORG_ID, clubIds, seasonName: `Summer ${year}/${String(year + 1).slice(2)}`, seasonStartYear: year, competitionName: src.competitionName,
      isJunior: false, fixture: { ...src.fixture, localDate: p.date },
    })
    if (!isSkip(bundle)) await upsertMatchBundle(payload, bundle, aliasMap)
  }
}

async function addFixtures(payload: Payload, fixtures: { gameId: string; date: string; status: string }[], base: { gradeId: string; gradeName: string; clubTeamId: string; clubTeamName: string; opponentName: string }): Promise<void> {
  for (const f of fixtures) {
    await payload.create({
      collection: 'selection-fixtures',
      data: {
        gameId: f.gameId, gradeId: base.gradeId, gradeName: base.gradeName, clubTeamId: base.clubTeamId, clubTeamName: base.clubTeamName, roundName: 'Demo round', localDate: f.date, localTime: '13:00:00',
        startsAt: wallClockToUtc(f.date, '13:00:00'), venueName: 'Home Oval', opponentName: base.opponentName, isHome: true, status: f.status, syncedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true, context: CTX,
    })
  }
}

export async function seedDemoFantasy(payload: Payload, adminEmail?: string): Promise<string> {
  const have = await payload.count({ collection: 'fantasy-seasons', overrideAccess: true })
  if (have.totalDocs > 0) return 'already present, skipped'
  if ((await payload.count({ collection: 'matches', overrideAccess: true })).totalDocs === 0) return 'no stored matches, skipped'
  const adminDocs = await payload.find({ collection: 'users', where: adminEmail ? { and: [{ role: { equals: 'admin' } }, { email: { equals: adminEmail } }] } : { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })
  const admin = adminDocs.docs[0]
  if (!admin) return 'no admin user (run seed:admin first), skipped'

  const year = currentSeasonStartYear()
  const today = currentClubDate()
  const template = (await payload.find({ collection: 'selection-fixtures', where: { gameId: { like: 'demo-' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { gradeId: string; gradeName: string; clubTeamId: string; clubTeamName: string; opponentName: string } | undefined
  const base = { gradeId: template?.gradeId ?? 'demo-grade-a', gradeName: template?.gradeName ?? 'A Grade', clubTeamId: template?.clubTeamId ?? 'demo-team-a', clubTeamName: template?.clubTeamName ?? 'A Grade', opponentName: template?.opponentName ?? 'Riverbend CC' }

  // Finished weekends. The best-player vote demo already has finished fixtures ("demo-final-*"): give those a stored game each, so
  // one set of games drives both features. The newest is left without a scorecard (a round that is not final yet). Without them,
  // make a small set of our own.
  const finals = (await payload.find({ collection: 'selection-fixtures', where: { gameId: { like: 'demo-final-' } }, sort: 'localDate', limit: 50, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as { gameId: string; localDate: string }[]
  let games: { gameId: string; date: string; from: 'normal' | 'forfeit'; index: number }[]
  let rainDate: string
  if (finals.length >= 6) {
    const stored = finals.slice(0, -1)
    games = stored.map((f, i) => (i === 2 ? { gameId: f.gameId, date: f.localDate, from: 'forfeit' as const, index: 0 } : { gameId: f.gameId, date: f.localDate, from: 'normal' as const, index: i < 2 ? i : i - 1 }))
    rainDate = weekendKey(stored[stored.length - 1].localDate)
    await storeDemoGames(payload, year, games)
    const fixtures = [{ gameId: 'demo-fantasy-rain', date: rainDate, status: 'upcoming' }] // washed out: the committee closes this round
    await addFixtures(payload, fixtures, base)
  } else {
    const [w1, w2, w3, w4] = [pastSaturday(5, today), pastSaturday(4, today), pastSaturday(3, today), pastSaturday(2, today)]
    rainDate = w4
    games = [
      { gameId: 'demo-fantasy-1', date: w1, from: 'normal', index: 0 },
      { gameId: 'demo-fantasy-2', date: w1, from: 'normal', index: 1 },
      { gameId: 'demo-fantasy-3', date: w2, from: 'normal', index: 2 },
      { gameId: 'demo-fantasy-4', date: w2, from: 'forfeit', index: 0 },
      { gameId: 'demo-fantasy-5', date: w3, from: 'normal', index: 3 },
    ]
    await storeDemoGames(payload, year, games)
    await addFixtures(payload, [
      ...games.map((g) => ({ gameId: g.gameId, date: g.date, status: 'final' })),
      { gameId: 'demo-fantasy-waiting', date: w3, status: 'upcoming' }, // no scorecard yet: the round stays "not final"
      { gameId: 'demo-fantasy-rain', date: w4, status: 'upcoming' },
    ], base)
  }
  const roundKeys = [...new Set([...games.map((g) => weekendKey(g.date)), weekendKey(rainDate)])].sort()
  const closeKey = weekendKey(rainDate)

  const facts = await factsOf(payload, [year, year - 1].filter((y) => y >= 2000))
  const made = await setUpSeason(payload, admin, { year, name: `${year}/${String(year + 1).slice(2)} season`, facts })
  if (!made.ok) return `set up failed: ${made.message}`
  let season: FantasySeason = made.season
  const priced = await calculatePrices(payload, admin, season, facts)
  if (!priced.ok) return `pricing failed: ${priced.message}`
  const opened = await openSeason(payload, admin, season)
  if (!opened.ok) return `open failed: ${opened.message}`
  season = opened.season
  await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { enabled: true, publicLeaderboard: true, competitionName: 'Fantasy cricket' } } as never, overrideAccess: true, context: CTX })
  const closed = await markRoundScored(payload, admin, season, closeKey, 'washed out')
  if (!closed.ok) console.log(`[seed-demo] fantasy: could not close the washed-out round: ${closed.message}`)

  // Managers and their squads for the past rounds (valid within the cap; some change a few players, some do nothing).
  const pool = [...(await loadPool(payload, season.id)).values()].filter((p) => p.inGame)
  const rand = mulberry32(20261013)
  const ids: number[] = []
  const cap = season.rules.salaryCapTenths
  const build = (): { picks: number[]; spent: number } | null => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const order = [...pool].sort(() => rand() - 0.5)
      const picks: typeof pool = []
      let spent = 0
      for (const p of order) {
        const slots = season.rules.squadSize - picks.length
        if (!slots) break
        const floor = (slots - 1) * season.rules.minPriceTenths
        if (spent + p.priceTenths + floor <= cap) {
          picks.push(p)
          spent += p.priceTenths
        }
      }
      if (picks.length === season.rules.squadSize) return { picks: picks.map((p) => p.id), spent }
    }
    return null
  }
  const price = new Map(pool.map((p) => [p.id, p.priceTenths]))
  const pins: string[] = []
  for (const [i, team] of TEAMS.entries()) {
    const pin = PINS[i]
    if (isBannedPin(pin)) throw new Error('[seed-demo] a demo PIN is on the banned list')
    const joined = await registerEntry(payload, { linkVersion: 1, ip: null }, season, { teamName: team, pin, again: pin })
    if (!joined.ok) return `could not add team ${team}: ${joined.message}`
    ids.push(joined.entry.id)
    pins.push(`${team}: ${pin}`)
    const first = build()
    if (!first) continue
    let picks: number[] = first.picks
    for (const [r, round] of roundKeys.entries()) {
      if (r > 0 && rand() < 0.35) continue // does nothing: keeps last round's team
      if (r > 0) {
        // Swap up to three players, keeping inside the cap.
        const next: number[] = [...picks]
        for (let s = 0; s < 3; s++) {
          const out = Math.floor(rand() * next.length)
          const inn = pool[Math.floor(rand() * pool.length)]
          const total = next.reduce((sum: number, id: number) => sum + (price.get(id) ?? 0), 0) - (price.get(next[out]) ?? 0) + inn.priceTenths
          if (!next.includes(inn.id) && total <= cap) next[out] = inn.id
        }
        picks = next
      }
      const spent = picks.reduce((sum: number, id: number) => sum + (price.get(id) ?? 0), 0)
      await payload.create({
        collection: 'fantasy-squads',
        data: { entry: joined.entry.id, round, captain: picks[Math.floor(rand() * picks.length)], spentTenths: spent, transfersUsed: 0, picks: picks.map((player) => ({ player })), savedAt: new Date().toISOString() } as never,
        overrideAccess: true, context: { ...CTX, fantasyRescore: true },
      })
    }
  }
  // This week's squads for five teams, through the real save (so the rules run); the others keep last round's team.
  let saved = 0
  for (const id of ids.slice(0, 5)) {
    const last = (await payload.find({ collection: 'fantasy-squads', where: { entry: { equals: id } }, sort: '-round', limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { picks?: { player: number | { id: number } }[]; captain: number | { id: number } } | undefined
    if (!last?.picks) continue
    const picks = last.picks.map((p) => (typeof p.player === 'number' ? p.player : p.player.id))
    const captain = typeof last.captain === 'number' ? last.captain : last.captain.id
    if ((await saveSquad(payload, season, id, { picks, captain })).ok) saved++
  }
  const open = await getOpenSeason(payload)
  console.log(`[seed-demo] fantasy PINs (demo only, shown here and nowhere else):\n  ${pins.join('\n  ')}`)
  return `season "${open?.name}" open, ${pool.length} priced players, ${roundKeys.length} finished rounds, ${TEAMS.length} teams, ${saved} squads saved for this week`
}
