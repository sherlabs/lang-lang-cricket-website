import type { Payload } from 'payload'
import { linkToken } from '../../lib/availability-link'
import { currentSeasonStartYear } from '../../lib/selection/season'
import { getSelectionSettings } from '../../lib/selection/store'
import { buildSnapshot } from '../../lib/selection/team-sheet'
import { clubToday } from '../../lib/selection-fixtures'
import { wallClockToUtc } from '../../lib/selection/fixtures-plan'
import { addDays } from '../../lib/votes/status'

/**
 * Demo best-player votes (wave B spec 3.11), on top of the demo squads: finished games with a published team each, and
 * deterministic ballots so `/votes`, the race chart, the private board and awards night have real-looking data. Four closed A
 * Grade games (one with a designed tie), two closed B Grade games, one older game with too few ballots to count, and one game
 * whose voting window is still open (the public page must not show it). Voting and the public leaderboard are switched on for the
 * demo only. Idempotent: skipped once any ballot exists. Local demo data only, invented players.
 */
const CTX = { disableRevalidate: true } as const

/** Small seeded generator, so the demo is the same every time. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks `k` distinct items, each draw weighted. */
function weighted<T>(rand: () => number, items: readonly T[], weight: (t: T, i: number) => number, k: number): T[] {
  const pool = items.map((t, i) => ({ t, w: weight(t, i) }))
  const out: T[] = []
  while (out.length < k && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0)
    let r = rand() * total
    const idx = pool.findIndex((p) => (r -= p.w) < 0)
    out.push(pool.splice(idx < 0 ? pool.length - 1 : idx, 1)[0].t)
  }
  return out
}

type DemoGame = { gameId: string; gradeId: string; gradeName: string; daysAgo: number; ballots: number; designed?: boolean }
const GAMES: DemoGame[] = [
  { gameId: 'demo-final-a1', gradeId: 'demo-grade-a', gradeName: 'A Grade', daysAgo: 37, ballots: 3 }, // too few to count
  { gameId: 'demo-final-a2', gradeId: 'demo-grade-a', gradeName: 'A Grade', daysAgo: 30, ballots: 9 },
  { gameId: 'demo-final-a3', gradeId: 'demo-grade-a', gradeName: 'A Grade', daysAgo: 23, ballots: 10 },
  { gameId: 'demo-final-a4', gradeId: 'demo-grade-a', gradeName: 'A Grade', daysAgo: 16, ballots: 8, designed: true }, // a designed tie
  { gameId: 'demo-final-a5', gradeId: 'demo-grade-a', gradeName: 'A Grade', daysAgo: 9, ballots: 11 },
  { gameId: 'demo-final-b1', gradeId: 'demo-grade-b', gradeName: 'B Grade', daysAgo: 16, ballots: 9 },
  { gameId: 'demo-final-b2', gradeId: 'demo-grade-b', gradeName: 'B Grade', daysAgo: 9, ballots: 10 },
  { gameId: 'demo-final-a6', gradeId: 'demo-grade-a', gradeName: 'A Grade', daysAgo: 1, ballots: 6 }, // voting still open
]
const OPPONENTS = ['Riverbend CC', 'Hillcrest CC', 'Creekside CC']
const WEIGHTS = [6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1]

export async function seedDemoVotes(payload: Payload): Promise<void> {
  const have = await payload.count({ collection: 'best-player-ballots', overrideAccess: true })
  if (have.totalDocs > 0) {
    console.log('[seed-demo] votes: already present, skipped')
    return
  }
  const squads = (await payload.find({ collection: 'squads', where: { gradeId: { like: 'demo-' } }, overrideAccess: true, pagination: false, depth: 0 })).docs
  const squadA = squads.find((s) => s.gradeId === 'demo-grade-a')
  const squadB = squads.find((s) => s.gradeId === 'demo-grade-b')
  if (!squadA || !squadB) {
    console.log('[seed-demo] votes: no demo squads to build on, skipped')
    return
  }
  const membersOf = async (squadId: number): Promise<number[]> =>
    (await payload.find({ collection: 'squad-members', where: { squad: { equals: squadId } }, overrideAccess: true, pagination: false, depth: 0, sort: 'id' })).docs.map((m) => (typeof m.player === 'object' ? (m.player as { id: number }).id : (m.player as number)))
  const squad = { 'demo-grade-a': await membersOf(squadA.id), 'demo-grade-b': await membersOf(squadB.id) } as Record<string, number[]>

  await payload.updateGlobal({ slug: 'selection-settings', data: { votes: { enabled: true, publicLeaderboard: true, publicScope: 'both', publicShowBreakdown: true, minBallotsToCount: 5, ballotValues: '3,2,1' } } as never, overrideAccess: true, context: CTX })

  const rand = mulberry32(20261012)
  const today = clubToday()
  const year = currentSeasonStartYear()
  let ballots = 0
  for (const [n, g] of GAMES.entries()) {
    const date = addDays(today, -g.daysAgo)
    const members = squad[g.gradeId]
    // Eleven of the squad play, rotating who sits out so "games" differs a little between players.
    const xi = Array.from({ length: Math.min(11, members.length) }, (_, i) => members[(i + (n % 3)) % members.length])
    const fixture = await payload.create({
      collection: 'selection-fixtures',
      data: {
        gameId: g.gameId,
        gradeId: g.gradeId,
        gradeName: g.gradeName,
        clubTeamId: `demo-team-${g.gradeId}`,
        clubTeamName: `Demo ${g.gradeName}`,
        roundName: `Round ${n + 1}`,
        localDate: date,
        localTime: '13:00:00',
        startsAt: wallClockToUtc(date, '13:00:00'),
        venueName: 'Home Reserve',
        opponentName: OPPONENTS[n % OPPONENTS.length],
        isHome: n % 2 === 0,
        status: 'final',
        syncedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
      context: CTX,
    })
    const publishedAt = new Date().toISOString()
    const slots = xi.map((player, i) => ({ player, order: i + 1, isCaptain: i === 1, isKeeper: i === 0 }))
    await payload.create({
      collection: 'team-sheets',
      data: { fixture: fixture.id, size: 11, markedReady: true, revision: 1, slots, publishedAt, publishCount: 1, publishedSnapshot: buildSnapshot({ slots, size: 11, revision: 1 }, publishedAt) } as never,
      overrideAccess: true,
      context: CTX,
    })

    const voters = [...xi].sort(() => rand() - 0.5).slice(0, g.ballots)
    const cast = async (voter: number, picks: number[], i: number) => {
      await payload.create({
        collection: 'best-player-ballots',
        data: { fixture: fixture.id, voterKey: `player:${voter}`, voter, picks: picks.map((player, k) => ({ place: k + 1, player })), source: 'voter', castAt: new Date(`${date}T${String(10 + (i % 8)).padStart(2, '0')}:30:00Z`).toISOString(), revision: 1 } as never,
        overrideAccess: true,
        context: CTX,
      })
      ballots += 1
    }
    if (g.designed) {
      // X and Y finish level on points AND on top votes (a shared first place); Z is third.
      const [x, y, z] = [xi[2], xi[3], xi[4]]
      const others = voters.filter((v) => ![x, y, z].includes(v))
      const all = others.length >= g.ballots ? others.slice(0, g.ballots) : [...others, ...xi.filter((p) => ![x, y, z].includes(p) && !others.includes(p))].slice(0, g.ballots)
      for (const [i, v] of all.entries()) await cast(v, i % 2 === 0 ? [x, y, z] : [y, x, z], i)
      continue
    }
    for (const [i, v] of voters.entries()) {
      const pickable = xi.filter((p) => p !== v)
      const picks = weighted(rand, pickable, (p) => WEIGHTS[xi.indexOf(p) % WEIGHTS.length] + (g.gradeId === 'demo-grade-b' ? (xi.indexOf(p) === 4 ? 4 : 0) : xi.indexOf(p) === 6 && n >= 3 ? 3 : 0), 3)
      await cast(v, picks, i)
    }
  }
  const settings = await getSelectionSettings(payload)
  console.log(`[seed-demo] votes: ${GAMES.length} finished games with published teams and ${ballots} anonymous ballots (voting and the public leaderboard are on for the demo, season ${year})`)
  console.log(`[seed-demo]   open the player link ${payload.config.serverURL}/availability/${linkToken(settings.linkVersion)}, sign in, then "Vote for best player" lists the open game`)
  console.log('[seed-demo]   public board: /votes, selector area: /selector/votes, awards night: /selector/present/votes')
}
