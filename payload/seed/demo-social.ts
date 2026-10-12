import type { Payload } from 'payload'
import { MATCH_SEED_SEASONS } from '../scripts/fixtures/match-seed-data'
import { buildImportedBundle } from '../../lib/history-import/bundle'
import { importedGameId, type ImportedGame, type MatchPlayerRow } from '../../lib/history-import/match-rows'
import { matchTables } from '../../lib/match-store/db'
import { playerTables } from '../../lib/players/db'
import { writeBundle } from '../../lib/match-store/write'
import { demoLogoPng } from './demo-png'
import { seedSocialGlobal } from './seed-social-global'

const CTX = { disableRevalidate: true } as const

const SPONSORS = [
  { name: 'Demo Hardware', tier: 'Platinum', color: [24, 76, 140] },
  { name: 'Demo Plumbing', tier: 'Gold', color: [180, 60, 40] },
  { name: 'Demo Fuel and Freight', tier: 'Gold', color: [30, 110, 70] },
  { name: 'Demo Cafe', tier: 'Silver', color: [110, 60, 130] },
] as const

/** Four sponsors with PNG logos made in code, so the pictures' sponsor strip has something real to draw. Idempotent by name. */
async function seedSponsors(payload: Payload): Promise<number> {
  let n = 0
  for (const s of SPONSORS) {
    const have = await payload.count({ collection: 'sponsors', where: { name: { equals: s.name } }, overrideAccess: true })
    if (have.totalDocs > 0) continue
    const data = demoLogoPng([...s.color] as [number, number, number])
    const media = await payload.create({ collection: 'media', data: { alt: `${s.name} logo` }, file: { data, mimetype: 'image/png', name: `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, size: data.length }, overrideAccess: true, context: CTX })
    await payload.create({ collection: 'sponsors', data: { name: s.name, tier: s.tier, logo: media.id, linkUrl: '', sortOrder: 50 + n }, overrideAccess: true, context: CTX })
    n++
  }
  return n
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Wave C demo data: the social-settings global in the club's voice, four PNG-logo sponsors, and one recent stored game with a
 * player-of-the-match performance (112 not out) plus two juniors in it: one without the social opt-in and one with. The juniors have
 * senior season rows, so only the eligibility rule keeps the first off pictures. Invented names; idempotent (the POTM player is the key).
 */
export async function seedDemoSocial(payload: Payload): Promise<void> {
  console.log(`[seed-demo] social settings: ${await seedSocialGlobal(payload)}`)
  console.log(`[seed-demo] social sponsors: ${await seedSponsors(payload)} created`)
  if ((await payload.count({ collection: 'matches', overrideAccess: true })).totalDocs === 0) {
    console.log('[seed-demo] social demo game: no stored matches, skipped')
    return
  }
  if ((await payload.count({ collection: 'players', where: { slug: { equals: 'riley-starr' } }, overrideAccess: true })).totalDocs > 0) {
    console.log('[seed-demo] social demo game: already present, skipped')
    return
  }
  const season = MATCH_SEED_SEASONS[MATCH_SEED_SEASONS.length - 1]
  const person = async (firstName: string, lastName: string, extra: { isJunior?: boolean; socialOptIn?: boolean } = {}) => {
    const doc = await payload.create({ collection: 'players', data: { firstName, lastName, bio: '', manualYears: '', ...extra }, overrideAccess: true, context: CTX })
    return doc.id
  }
  const riley = await person('Riley', 'Starr')
  const jamie = await person('Jamie', 'Junior', { isJunior: true, socialOptIn: false })
  const casey = await person('Casey', 'Consent', { isJunior: true, socialOptIn: true })
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const stamp = new Date().toISOString()
  for (const [player, games, runs, wickets] of [[riley, 9, 614, 4], [jamie, 8, 702, 2], [casey, 7, 188, 21]] as const) {
    await db.insert(t.player_seasons).values({
      player, seasonName: season.name, seasonOrder: 1, teamId: 'demo-b', teamName: 'Demo B', gradeName: 'Demo B Grade', games, batInnings: games, batRuns: runs, batHighScore: 112, batBalls: runs * 2,
      bowlBalls: wickets * 24, bowlRuns: wickets * 18, bowlWickets: wickets, createdAt: stamp, updatedAt: stamp,
    })
  }
  const date = isoDay(new Date(Date.now() - 3 * 86_400_000))
  const row = (n: number, first: string, last: string, over: Partial<MatchPlayerRow>): MatchPlayerRow => ({
    row: n, firstName: first, lastName: last, nameKey: `${first}|${last}`.toLowerCase(), batted: true, runs: 0, balls: null, fours: null, sixes: null, howOut: 'bowled',
    bowlBalls: null, maidens: null, runsConceded: null, wickets: null, ...over,
  })
  const game: ImportedGame = {
    gameId: importedGameId({ date, gradeName: 'Demo B Grade', teamName: 'Demo B', opponent: 'Demo Rovers', gameRef: null }),
    firstRow: 2, date, seasonStartYear: season.startYear, seasonName: season.name, gradeName: 'Demo B Grade', teamName: 'Demo B', teamSlug: 'demo-b', opponent: 'Demo Rovers', gameRef: null,
    format: 'one_day', result: 'won', teamRuns: 212, teamWickets: 4, oppRuns: 160, oppWickets: 10,
    players: [
      row(2, 'Riley', 'Starr', { runs: 112, balls: 84, fours: 12, sixes: 4, howOut: 'not_out', bowlBalls: 36, runsConceded: 21, wickets: 2, maidens: 1 }),
      row(3, 'Jamie', 'Junior', { runs: 61, balls: 58, fours: 6, sixes: 1, howOut: 'caught' }),
      row(4, 'Casey', 'Consent', { runs: 14, balls: 20, howOut: 'bowled', bowlBalls: 48, runsConceded: 30, wickets: 3, maidens: 0 }),
    ],
  }
  await db.transaction((tx: unknown) =>
    writeBundle(tx, matchTables(payload), buildImportedBundle(game), new Map([['riley|starr', riley], ['jamie|junior', jamie], ['casey|consent', casey]]), { source: 'import', importBatch: 'imp-demo-social' }),
  )
  console.log('[seed-demo] social demo game: 1 stored game with a 112 not out, and two juniors (one with the social opt-in) created')
}
