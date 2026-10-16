import type { Payload } from 'payload'
import { currentSeasonStartYear } from '../../lib/selection/season'
import { playerTables } from '../../lib/players/db'

const CTX = { disableRevalidate: true } as const
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The grade and team the Home page's "Season at a glance" describes in the demo. */
const GRADE = 'A Grade'
const TEAM = 'Demo A Grade'

/**
 * Demo data for the admin Home page (wave G WP-3). Idempotent: every row has a fixed key and is only created when missing.
 * - A recent successful update, so "as of" is fresh (the card is left out for stale data).
 * - Three finished senior games this season and one upcoming game, so Season at a glance has a record, a last result and a next game.
 * - One player a couple of games short of 50, so Milestones has a row. Invented name; the "Games before PlayHQ" field carries the count.
 * Local demo data only; nothing here reaches PlayHQ.
 */
export async function seedDemoHome(payload: Payload, today: string): Promise<string> {
  const notes: string[] = []
  const stamp = new Date().toISOString()

  const t = playerTables(payload)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const recent = await payload.count({ collection: 'player-sync-runs', where: { and: [{ status: { equals: 'ok' } }, { finishedAt: { greater_than: weekAgo } }] }, overrideAccess: true })
  if (recent.totalDocs === 0) {
    await payload.db.drizzle.insert(t.player_sync_runs).values({ status: 'ok', startedAt: stamp, finishedAt: stamp, playersCreated: 0, seasonRows: 0, matchesUpserted: 3, createdAt: stamp, updatedAt: stamp })
    notes.push('recent update')
  }

  const year = currentSeasonStartYear()
  const games = [
    { gameId: 'demo-home-final-1', back: 17, opponent: 'Riverbend CC', result: 'won' },
    { gameId: 'demo-home-final-2', back: 10, opponent: 'Hillcrest CC', result: 'won' },
    { gameId: 'demo-home-final-3', back: 3, opponent: 'Creekside CC', result: 'lost' },
  ] as const
  for (const g of games) {
    if ((await payload.count({ collection: 'matches', where: { gameId: { equals: g.gameId } }, overrideAccess: true })).totalDocs > 0) continue
    await payload.create({
      collection: 'matches', overrideAccess: true, context: CTX,
      data: {
        gameId: g.gameId, status: 'FINAL', type: 'ONE_DAY', seasonStartYear: year, gradeName: GRADE, clubTeamName: TEAM, opponentName: g.opponent, opponentOrgName: g.opponent,
        localDate: addDays(today, -g.back), result: g.result, syncedAt: stamp, source: 'import', importBatch: 'demo-home',
      } as never,
    })
    notes.push(g.gameId)
  }

  const nextKey = 'demo-home-next'
  if ((await payload.count({ collection: 'selection-fixtures', where: { gameId: { equals: nextKey } }, overrideAccess: true })).totalDocs === 0) {
    await payload.create({
      collection: 'selection-fixtures', overrideAccess: true, context: CTX,
      data: { gameId: nextKey, gradeId: 'demo-grade-a', gradeName: GRADE, clubTeamId: 'demo-team-demo-grade-a', clubTeamName: TEAM, roundName: 'Next round', localDate: addDays(today, 4), localTime: '13:00', opponentName: 'Riverbend CC', isHome: true, status: 'upcoming', syncedAt: stamp } as never,
    })
    notes.push('next game')
  }

  if ((await payload.count({ collection: 'players', where: { slug: { equals: 'milo-stone' } }, overrideAccess: true })).totalDocs === 0) {
    await payload.create({ collection: 'players', overrideAccess: true, context: CTX, data: { firstName: 'Milo', lastName: 'Stone', slug: 'milo-stone', baselineGames: 48, bio: '' } as never })
    notes.push('milestone player')
  }
  return notes.length ? `added ${notes.join(', ')}` : 'already present, skipped'
}
