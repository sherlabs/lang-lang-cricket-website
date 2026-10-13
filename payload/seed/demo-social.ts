import type { Payload } from 'payload'
import { MATCH_SEED_SEASONS } from '../scripts/fixtures/match-seed-data'
import { buildImportedBundle } from '../../lib/history-import/bundle'
import { importedGameId, type ImportedGame, type MatchPlayerRow } from '../../lib/history-import/match-rows'
import { matchTables } from '../../lib/match-store/db'
import { playerTables } from '../../lib/players/db'
import { writeBundle } from '../../lib/match-store/write'
import sharp from 'sharp'
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
  // One sponsor with no logo at all, so the name-only thank-you (and the composer's note about it) can be seen. Not named "Demo ...":
  // the demo posting queue picks its sponsors by that prefix and all of them have logos.
  const bare = 'Sample Garage'
  if ((await payload.count({ collection: 'sponsors', where: { name: { equals: bare } }, overrideAccess: true })).totalDocs === 0) {
    await payload.create({ collection: 'sponsors', data: { name: bare, tier: 'Bronze', linkUrl: '', sortOrder: 60 }, overrideAccess: true, context: CTX })
    n++
  }
  return n
}

/** Hex colours here are deliberate: sample-logo artwork for demo data, not UI tokens (the brand-hex guard skips payload/seed). */
/** Neutral logos made in code: abstract shapes and two initials, as SVG text. No real brand, no download. */
const logoSvg = (initials: string, a: string, b: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" rx="24" fill="${a}"/><circle cx="120" cy="120" r="78" fill="${b}"/><rect x="230" y="70" width="190" height="24" rx="12" fill="${b}"/><rect x="230" y="116" width="140" height="24" rx="12" fill="${b}" opacity="0.7"/><rect x="230" y="162" width="100" height="24" rx="12" fill="${b}" opacity="0.45"/><text x="120" y="146" font-family="sans-serif" font-size="72" font-weight="700" text-anchor="middle" fill="${a}">${initials}</text></svg>`

/**
 * Sponsors that exercise the logo pipeline: one SVG, one PNG made by sharp, one WebP. Named "Sample ..." (not "Demo ...") because the demo
 * posting queue picks its sponsors by the "Demo" prefix. Idempotent by name.
 */
export async function seedFormatSponsors(payload: Payload): Promise<number> {
  const defs = [
    { name: 'Sample Studio', tier: 'Silver', mime: 'image/svg+xml', file: 'sample-studio.svg', data: async () => Buffer.from(logoSvg('SS', '#1f4e79', '#f2f2f2')) },
    { name: 'Sample Orchard', tier: 'Gold', mime: 'image/png', file: 'sample-orchard.png', data: async () => sharp(Buffer.from(logoSvg('SO', '#2f6b3a', '#f6efe0'))).png().toBuffer() },
    { name: 'Sample Print Co', tier: 'Bronze', mime: 'image/webp', file: 'sample-print-co.webp', data: async () => sharp(Buffer.from(logoSvg('PC', '#7a3b1d', '#fbe9d0'))).webp().toBuffer() },
  ]
  let n = 0
  for (const d of defs) {
    if ((await payload.count({ collection: 'sponsors', where: { name: { equals: d.name } }, overrideAccess: true })).totalDocs > 0) continue
    const data = await d.data()
    const media = await payload.create({ collection: 'media', data: { alt: `${d.name} logo` }, file: { data, mimetype: d.mime, name: d.file, size: data.length }, overrideAccess: true, context: CTX })
    await payload.create({ collection: 'sponsors', data: { name: d.name, tier: d.tier as 'Silver', logo: media.id, linkUrl: '', sortOrder: 70 + n }, overrideAccess: true, context: CTX })
    n++
  }
  return n
}

/**
 * A second stored game so the picker has more than one row: a long opposition name and a grade with a competition numbering prefix, both
 * invented. Keyed by its import batch, so it is created once.
 */
export async function seedDemoSecondGame(payload: Payload): Promise<void> {
  if ((await payload.count({ collection: 'matches', where: { importBatch: { equals: 'imp-demo-social-2' } }, overrideAccess: true })).totalDocs > 0) return
  const found = await payload.find({ collection: 'players', where: { slug: { in: ['riley-starr', 'jamie-junior', 'casey-consent'] } }, limit: 3, depth: 0, overrideAccess: true })
  const idOf = (slug: string) => found.docs.find((p) => p.slug === slug)?.id
  const [riley, jamie, casey] = [idOf('riley-starr'), idOf('jamie-junior'), idOf('casey-consent')]
  if (riley === undefined || jamie === undefined || casey === undefined) return
  const season = MATCH_SEED_SEASONS[MATCH_SEED_SEASONS.length - 1]
  const date = isoDay(new Date(Date.now() - 10 * 86_400_000))
  const row = (n: number, first: string, last: string, over: Partial<MatchPlayerRow>): MatchPlayerRow => ({
    row: n, firstName: first, lastName: last, nameKey: `${first}|${last}`.toLowerCase(), batted: true, runs: 0, balls: null, fours: null, sixes: null, howOut: 'bowled',
    bowlBalls: null, maidens: null, runsConceded: null, wickets: null, ...over,
  })
  const opponent = 'Northern Districts Cricket Association Seniors Reserve'
  const game: ImportedGame = {
    gameId: importedGameId({ date, gradeName: '2. Demo District Seniors', teamName: 'Demo CC District Seniors', opponent, gameRef: null }),
    firstRow: 2, date, seasonStartYear: season.startYear, seasonName: season.name, gradeName: '2. Demo District Seniors', teamName: 'Demo CC District Seniors', teamSlug: 'demo-district', opponent, gameRef: null,
    format: 'one_day', result: 'lost', teamRuns: 141, teamWickets: 10, oppRuns: 142, oppWickets: 6,
    players: [row(2, 'Riley', 'Starr', { runs: 47, balls: 52, fours: 5, howOut: 'caught' }), row(3, 'Jamie', 'Junior', { runs: 22, balls: 31, howOut: 'bowled' }), row(4, 'Casey', 'Consent', { runs: 9, balls: 14, howOut: 'lbw', bowlBalls: 54, runsConceded: 41, wickets: 2, maidens: 1 })],
  }
  await payload.db.drizzle.transaction((tx: unknown) =>
    writeBundle(tx, matchTables(payload), buildImportedBundle(game), new Map([['riley|starr', riley], ['jamie|junior', jamie], ['casey|consent', casey]]), { source: 'import', importBatch: 'imp-demo-social-2' }),
  )
  console.log('[seed-demo] social demo game 2: long opposition name and a numbered grade created')
}

/**
 * Toss details for the demo game (the club won the toss and chose to bat), so the Toss picture has one game to draw. The games the
 * selection demo stores have no toss at all, so the chooser lists exactly one game. Idempotent: only a game with no toss yet is touched.
 */
async function seedDemoToss(payload: Payload): Promise<void> {
  const { docs } = await payload.find({ collection: 'matches', where: { and: [{ importBatch: { equals: 'imp-demo-social' } }, { clubWonToss: { exists: false } }] }, limit: 1, depth: 0, overrideAccess: true })
  if (!docs[0]) return
  await payload.update({ collection: 'matches', id: docs[0].id, data: { clubWonToss: true, tossChoice: 'bat' }, overrideAccess: true, context: CTX })
  console.log('[seed-demo] social demo game: toss details added (club won the toss, chose to bat)')
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Wave C demo data: the social-settings global in the club's voice, four PNG-logo sponsors, and one recent stored game with a
 * player-of-the-match performance (112 not out) plus two juniors in it: one without the social opt-in and one with. The juniors have
 * senior season rows, so only the eligibility rule keeps the first off pictures. Invented names; idempotent (the POTM player is the key).
 */
export async function seedDemoSocial(payload: Payload): Promise<void> {
  console.log(`[seed-demo] social settings: ${await seedSocialGlobal(payload)}`)
  console.log(`[seed-demo] social sponsors: ${await seedSponsors(payload)} created, ${await seedFormatSponsors(payload)} with SVG, PNG and WebP logos`)
  if ((await payload.count({ collection: 'matches', overrideAccess: true })).totalDocs === 0) {
    console.log('[seed-demo] social demo game: no stored matches, skipped')
    return
  }
  if ((await payload.count({ collection: 'players', where: { slug: { equals: 'riley-starr' } }, overrideAccess: true })).totalDocs > 0) {
    console.log('[seed-demo] social demo game: already present, skipped')
    await seedDemoToss(payload)
    await seedDemoSecondGame(payload)
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
  await seedDemoToss(payload)
  await seedDemoSecondGame(payload)
}

type SeedTarget = { network: string; size: string; status: string; attempts?: number; finalText?: string | null; nextAttemptAt?: string | null; lastError?: string; errorCode?: string; remoteId?: string; manual?: boolean; publishedAt?: string }
type SeedPost = { title: string; status: string; hoursFromNow: number; targets: SeedTarget[]; finishedHoursAgo?: number }

const WORDS = 'Thank you to our sponsors.\n\n#club #cricket'

/**
 * Wave C WP-2 demo data: six queued posts covering every state the queue shows (a draft, two scheduled with one already due so a local
 * run of `GET /api/cron/social-posts` publishes it through the Test network, one posted by hand, one failed with a plain reason and one
 * with an unknown outcome). They draw from the seeded sponsors, so the pictures and the download fallback work. Idempotent by a hidden
 * title key. Nothing here reaches a network; to see the scheduler publish, start the site with SOCIAL_MOCK_NETWORK=yes (documented in
 * .env.example), never in code.
 */
export async function seedDemoSocialQueue(payload: Payload): Promise<void> {
  const sponsors = await payload.find({ collection: 'sponsors', where: { name: { like: 'Demo' } }, limit: 4, sort: 'name', depth: 0, overrideAccess: true })
  if (sponsors.docs.length === 0) {
    console.log('[seed-demo] social queue: no demo sponsors, skipped')
    return
  }
  // The snapshot is built here rather than loaded through the picture pipeline (which is behind `server-only`): the same logos, drawn from the same PNG source.
  const logoOf = (name: string) => `data:image/png;base64,${demoLogoPng([...(SPONSORS.find((x) => x.name === name)?.color ?? [90, 90, 90])] as [number, number, number]).toString('base64')}`
  const data = { sponsors: sponsors.docs.map((d) => ({ name: d.name, tier: d.tier, logo: logoOf(d.name) })), line: '' }
  const admin = await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })
  const approver = admin.docs[0]?.id
  if (approver === undefined) console.log('[seed-demo] social queue: no admin user yet (run seed:admin first); scheduled posts will fail with the approver message')
  const spec = {
    type: 'sponsor-thanks', style: 'bold', raw: { source: sponsors.docs.map((s) => s.id).join(',') },
    snapshot: { data, players: [] }, playerIds: [], sponsorIds: sponsors.docs.map((s) => s.id),
  }
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
  const posts: SeedPost[] = [
    { title: 'Demo post: draft thank-you', status: 'draft', hoursFromNow: 48, targets: [{ network: 'mock', size: 'square', status: 'pending', finalText: null }] },
    { title: 'Demo post: scheduled for tomorrow', status: 'scheduled', hoursFromNow: 24, targets: [{ network: 'mock', size: 'square', status: 'pending', finalText: WORDS }] },
    { title: 'Demo post: due now (run the scheduler)', status: 'scheduled', hoursFromNow: -1, targets: [{ network: 'mock', size: 'landscape', status: 'pending', finalText: WORDS }] },
    {
      title: 'Demo post: already posted', status: 'published', hoursFromNow: -26, finishedHoursAgo: 26,
      targets: [
        { network: 'facebook', size: 'landscape', status: 'published', attempts: 1, finalText: WORDS, remoteId: 'manual', manual: true, publishedAt: hours(-26) },
        { network: 'x', size: 'landscape', status: 'published', attempts: 1, finalText: WORDS, remoteId: 'manual', manual: true, publishedAt: hours(-26) },
      ],
    },
    {
      title: 'Demo post: did not post', status: 'failed', hoursFromNow: -3, finishedHoursAgo: 3,
      targets: [
        { network: 'instagram', size: 'square', status: 'failed', attempts: 3, finalText: WORDS, errorCode: 'media_rejected', lastError: 'The network could not use the picture.' },
        { network: 'mock', size: 'square', status: 'published', attempts: 1, finalText: WORDS, remoteId: 'mock-demo-1', publishedAt: hours(-3) },
      ],
    },
    {
      title: 'Demo post: not sure it went out', status: 'failed', hoursFromNow: -5, finishedHoursAgo: 5,
      targets: [{ network: 'x', size: 'landscape', status: 'unknown', attempts: 1, finalText: WORDS, errorCode: 'unknown_outcome', lastError: 'Not sure it went out. Check the page.' }],
    },
  ]
  let n = 0
  for (const p of posts) {
    const have = await payload.count({ collection: 'social-posts', where: { title: { equals: p.title } }, overrideAccess: true })
    if (have.totalDocs > 0) continue
    const live = p.status === 'scheduled'
    const created = await payload.create({
      collection: 'social-posts',
      data: {
        title: p.title, status: p.status, spec: spec as never, caption: 'Thank you to our sponsors.', hashtags: ['club', 'cricket'],
        scheduledFor: hours(p.hoursFromNow), nextRunAt: live ? hours(p.hoursFromNow) : undefined, finishedAt: p.finishedHoursAgo ? hours(-p.finishedHoursAgo) : undefined,
        approvedBy: p.status === 'draft' ? undefined : approver, approvedAt: p.status === 'draft' || approver === undefined ? undefined : new Date().toISOString(), createdBy: approver, revision: 1,
      } as never,
      overrideAccess: true, depth: 0, context: CTX,
    })
    for (const t of p.targets) {
      await payload.create({
        collection: 'social-post-targets',
        data: { post: created.id, network: t.network, size: t.size, finalText: t.finalText, status: t.status, attempts: t.attempts ?? 0, nextAttemptAt: t.nextAttemptAt, lastError: t.lastError, errorCode: t.errorCode, remoteId: t.remoteId, publishedAt: t.publishedAt, manual: t.manual ?? false } as never,
        overrideAccess: true, depth: 0, context: CTX,
      })
    }
    n++
  }
  console.log(`[seed-demo] social queue: ${n} posts created`)
}
