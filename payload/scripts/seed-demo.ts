/**
 * Demo content for a fresh database (spec §18 WP6): a new club, or a developer without the
 * legacy dump, gets a populated site. Everything comes from `public/assets` and goes through
 * the Payload Local API, so files land on local disk (`./media`, `./documents`,
 * `./gallery-photos`). It refuses to run with a Blob token, so it never writes to Blob.
 *
 *   pnpm seed:demo --target 127.0.0.1/langlang_dev --confirm [--theme-sample blue]
 *
 * This is Lang Lang demo content (sponsors, people, emails, ground): a new club replaces the arrays
 * below. `--theme-sample blue` writes a blue palette to the `theme` global (overwriting a saved theme)
 * so a second club look can be eyeballed locally; without it the Lang Lang seed is written only when
 * the theme was never saved.
 *
 * It also writes about 25 synthesised matches (invented players and opponents) into the per-match store
 * through the real writer, only when `matches` is empty, and prints the reconciliation against the season
 * aggregates (expect 0 mismatches).
 *
 * It also writes four info pages (one a draft, one footer-placed) and six news posts (four published with covers
 * from the gallery, one draft, one scheduled two weeks ahead), only when `pages` or `news` is empty.
 *
 * Idempotent: the `club` global is seeded only when it was never saved, and each collection is
 * filled only when it is empty. Run `seed:admin` separately for the first user.
 */
import config from '@payload-config'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { getPayload, type CollectionSlug, type Payload } from 'payload'
import { htmlToLexical } from '../../lib/stories-convert'
import { blobToken } from '../env'
import { DEMO_NEWS, DEMO_PAGES } from '../seed/demo-pages-news'
import { seedClubGlobal } from '../seed/seed-club-global'
import { seedThemeGlobal } from '../seed/seed-theme-global'
import { PLAYHQ_ORG_ID } from '../../lib/playhq/client'
import { PRESETS, presetHref } from '../../lib/stats/presets'
import { mergePlayerInto } from '../../lib/players/merge-core'
import { playerTables } from '../../lib/players/db'
import { guard } from './_guard'
import { reconcileSeed, seedMatchSeasonRows, seedMatchStore } from './fixtures/match-seed-db'
import { MATCH_SEED_SEASONS } from './fixtures/match-seed-data'

const PUBLIC = path.resolve(process.cwd(), 'public')
const CTX = { disableRevalidate: true } as const

export const DEMO_DOCUMENTS = [
  { category: 'Codes of Conduct', title: 'CCCA General Code of Conduct', file: 'ccca-general-code-of-conduct.pdf' },
  { category: 'Codes of Conduct', title: 'CCCA Junior Code of Conduct', file: 'ccca-junior-code-of-conduct.pdf' },
  { category: 'Codes of Conduct', title: 'CCCA Parent Code of Conduct', file: 'ccca-parent-code-of-conduct.pdf' },
  { category: 'Policies', title: 'CCCA Extreme Weather Policy', file: 'ccca-extreme-weather-policy.pdf' },
  { category: 'Policies', title: 'CCCA Social Media Policy', file: 'ccca-social-media-policy.pdf' },
  { category: 'Policies', title: 'CCCA WWCC Policy', file: 'ccca-wwcc-policy.pdf' },
  { category: 'Policies', title: 'CV Complaints & Resolution Policy 2024', file: 'cv-complaints-resolution-policy-2024.pdf' },
  { category: 'Policies', title: 'CV Smoke Pollution Guidelines', file: 'cv-smoke-pollution-guidelines.pdf' },
  { category: 'Policies', title: 'CV Suspect Bowling Actions Guidelines', file: 'cv-suspect-bowling-actions-guidelines.pdf' },
  { category: 'Child Safety', title: 'Betrayal of Trust Fact Sheet', file: 'betrayal-of-trust-fact-sheet.pdf' },
  { category: 'Child Safety', title: 'LLCC Conflict Resolution Policy', file: 'llcc-conflict-resolution-policy.pdf' },
  { category: 'Child Safety', title: "Australian Cricket's Policy for Safeguarding Children & Young People", file: 'safeguarding-children-policy.pdf' },
  { category: 'Child Safety', title: "Australian Cricket's Commitment to Safeguarding Children and Young People", file: 'safeguarding-commitment.pdf' },
  { category: 'Child Safety', title: 'Code of Behaviour for Affiliated Associations, Clubs and Indoor Centres', file: 'code-of-behaviour-affiliated-clubs.pdf' },
  { category: 'Game Day', title: 'Marsh Sport Cricket Game Day Training Checklist', file: 'game-day-training-checklist.pdf' },
  { category: 'CCCA Directory', title: 'CCCA Directory 25/26', file: 'ccca-directory-25-26.pdf' },
] as const

export const DEMO_SPONSORS = [
  { tier: 'Platinum', name: 'Bendigo Bank – Community Bank Lang Lang', logo: 'bendigo-bank.webp', linkUrl: 'https://www.bendigobank.com.au' },
  { tier: 'Gold', name: 'Vibe N Shine Clean Co', logo: 'vibe-and-shine.webp', linkUrl: '' },
  { tier: 'Gold', name: 'Yellow Brick Road – Phillip Island', logo: 'yellowbrickroad.webp', linkUrl: '' },
  { tier: 'Silver', name: 'Si.Co Contracting', logo: 'sico-contracting.webp', linkUrl: '' },
  { tier: 'Silver', name: 'Lang Lang Pharmacy', logo: null, linkUrl: '' },
  { tier: 'Silver', name: 'Sunscape Solar', logo: 'sunscape-solar.webp', linkUrl: 'https://www.sunscapesolar.com.au' },
  { tier: 'Bronze', name: 'Lang Lang Sands', logo: 'lang-lang-sands.webp', linkUrl: '' },
  { tier: 'Bronze', name: 'David Jansz Security', logo: 'david-jansz-security.webp', linkUrl: '' },
  { tier: 'Player', name: 'Sunscape Solar', logo: 'sunscape-solar.webp', linkUrl: 'https://www.sunscapesolar.com.au' },
  { tier: 'Player', name: 'Central Insurance Australia', logo: 'central-insurance.webp', linkUrl: '' },
] as const

export const DEMO_PEOPLE = [
  { section: 'committee', role: 'President', name: 'Eddie Duiker', phone: '0423 465 992', email: 'langlangcricketclub@gmail.com' },
  { section: 'committee', role: 'Treasurer', name: 'Karen Duiker', phone: '0423 201 257', email: 'langlangcricketclub@gmail.com' },
  { section: 'committee', role: 'Secretary / Child Safety Officer & Junior Coordinator', name: 'Erin Jozwin', phone: '0421 991 436', email: 'langlangcricketclub@gmail.com' },
  { section: 'leadership', role: 'Senior Leadership Team', name: 'Brad Savige', phone: '', email: '' },
  { section: 'leadership', role: 'Senior Leadership Team', name: 'William Wykes', phone: '', email: '' },
  { section: 'leadership', role: 'Senior Leadership Team', name: 'Russell Savige', phone: '', email: '' },
] as const

/** photo-17..76 (WebP, newest) first, then photo-01..16 (the original JPGs): the legacy order. */
export function demoGalleryFiles(available: readonly string[]): string[] {
  const order = [
    ...Array.from({ length: 60 }, (_, i) => `photo-${i + 17}.webp`),
    ...Array.from({ length: 16 }, (_, i) => `photo-${String(i + 1).padStart(2, '0')}.jpg`),
  ]
  const have = new Set(available)
  return order.filter((f) => have.has(f))
}

const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

async function isEmpty(payload: Payload, collection: CollectionSlug) {
  return (await payload.count({ collection, overrideAccess: true })).totalDocs === 0
}

async function seedCollection(payload: Payload, collection: CollectionSlug, fill: () => Promise<number>) {
  if (!(await isEmpty(payload, collection))) {
    console.log(`[seed-demo] ${collection}: not empty, skipped`)
    return
  }
  try {
    console.log(`[seed-demo] ${collection}: ${await fill()} created`)
  } catch (err) {
    // Leave the collection empty again, so a re-run fills it instead of skipping it.
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true, context: CTX })
    throw err
  }
}

/** Per-match store demo data (WP-M): idempotent, only when `matches` is empty. */
async function seedDemoMatches(payload: Payload) {
  if (!(await isEmpty(payload, 'matches'))) {
    console.log('[seed-demo] matches: not empty, skipped')
    return
  }
  const r = await seedMatchStore(payload, { clubOrgId: PLAYHQ_ORG_ID })
  const rec = await reconcileSeed(payload, PLAYHQ_ORG_ID)
  // Season totals for the same players, so leaderboards, records and profiles are populated too.
  const seasonRows = (await isEmpty(payload, 'player-seasons')) ? await seedMatchSeasonRows(payload, PLAYHQ_ORG_ID) : 0
  console.log(`[seed-demo] player-seasons: ${seasonRows} created for the seeded players`)
  console.log(`[seed-demo] matches: ${r.created} created, ${r.skipped} skipped by the mapper (abandoned), ${r.players} players and ${r.aliases} aliases created; reconcile: ${rec.mismatchedPlayers} mismatches over ${rec.playersCompared} players`)
}

/**
 * W2 StatLab demo data: a published yearbook for the newest seeded season (so the match-data sections
 * render in the preview) and two admin-only saved reports built from presets. Idempotent.
 */
async function seedDemoStatLab(payload: Payload) {
  const season = MATCH_SEED_SEASONS[MATCH_SEED_SEASONS.length - 1].name
  if ((await payload.count({ collection: 'matches', overrideAccess: true })).totalDocs === 0) {
    console.log('[seed-demo] yearbook and saved reports: no stored matches, skipped')
    return
  }
  const have = await payload.count({ collection: 'yearbooks', where: { seasonName: { equals: season } }, overrideAccess: true })
  if (have.totalDocs === 0) {
    await payload.create({
      collection: 'yearbooks',
      data: { title: `${season.replace(/^[A-Za-z]+ /, '')} Yearbook`, seasonName: season, status: 'published', presidentMessage: '', coachMessage: '', sponsorMessage: '' },
      overrideAccess: true, context: CTX,
    })
    console.log(`[seed-demo] yearbooks: published ${season}`)
  } else console.log('[seed-demo] yearbooks: already present, skipped')
  if (!(await isEmpty(payload, 'saved-reports'))) {
    console.log('[seed-demo] saved-reports: not empty, skipped')
    return
  }
  const owner = (await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!owner) {
    console.log('[seed-demo] saved-reports: no admin user (run seed:admin first), skipped')
    return
  }
  for (const key of ['fifty-makers', 'best-partnerships']) {
    const preset = PRESETS.find((p) => p.key === key)!
    const href = presetHref(preset)
    await payload.create({
      collection: 'saved-reports',
      data: { title: preset.label, query: href.slice(href.indexOf('?') + 1), description: preset.blurb, owner: owner.id },
      overrideAccess: true, context: CTX,
    })
  }
  console.log('[seed-demo] saved-reports: 2 created')
}


/**
 * W2 admin-tools demo data (invented names, idempotent via the "jon-sample" player): grade spelling variants and one label rename,
 * a near-duplicate pair that was never in one game (suggested), a same-game pair (never suggested, and a manual merge is refused), one
 * merge made through the real merge code (so Recent merges has an undoable entry), a preferred name, and a hand-written season summary.
 */
async function seedDemoAdminTools(payload: Payload) {
  const season = MATCH_SEED_SEASONS[MATCH_SEED_SEASONS.length - 1]
  if ((await payload.count({ collection: 'matches', overrideAccess: true })).totalDocs === 0) {
    console.log('[seed-demo] admin tools: no stored matches, skipped')
    return
  }
  const have = await payload.count({ collection: 'players', where: { slug: { equals: 'jon-sample' } }, overrideAccess: true })
  if (have.totalDocs > 0) {
    console.log('[seed-demo] admin tools: already present, skipped')
    return
  }
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const stamp = new Date().toISOString()
  const order = 1 // the newest seeded season (the demo season rows number it 1)
  const person = async (first: string, last: string) => {
    const [p] = await db.insert(t.players).values({ slug: `${first}-${last}`.toLowerCase(), firstName: first, lastName: last, displayName: `${first} ${last}`, source: 'playhq', bio: '', manualYears: '', isActiveDerived: true, hidden: false, createdAt: stamp, updatedAt: stamp }).returning({ id: t.players.id })
    await db.insert(t.player_aliases).values({ nameKey: `${first}|${last}`.toLowerCase(), player: p.id, createdAt: stamp, updatedAt: stamp })
    return p.id as number
  }
  const row = (player: number, teamId: string, teamName: string, gradeName: string, games = 6) =>
    db.insert(t.player_seasons).values({ player, seasonName: season.name, seasonOrder: order, teamId, teamName, gradeName, games, batInnings: games, batRuns: games * 18, batHighScore: 44, batBalls: games * 30, createdAt: stamp, updatedAt: stamp })

  // Near-duplicate pair: different spellings, same team, never in one game. The grade is spelled two ways ("2. " numbering).
  const jon = await person('Jon', 'Sample')
  const john = await person('John', 'Sample')
  await row(jon, 'demo-district', 'Demo District', '2. Demo District')
  await row(john, 'demo-district', 'Demo District', 'Demo District', 8)
  // More spelling variants: "Demo B Grade" (most common) and "Demo B grade", plus a grade the club calls the same thing.
  const bees = [await person('Bea', 'Sample'), await person('Ben', 'Sample'), await person('Bo', 'Sample')]
  await row(bees[0], 'demo-b', 'Demo B', 'Demo B Grade')
  await row(bees[1], 'demo-b', 'Demo B', 'Demo B Grade')
  await row(bees[2], 'demo-b', 'Demo B', 'Demo B grade')
  // Same-game pair: both listed in one imported game, so they are never suggested and a manual merge is refused.
  const pat = await person('Pat', 'Twin')
  const patrick = await person('Patrick', 'Twin')
  await row(pat, 'demo-seconds', 'Demo Seconds', 'Demo Seconds')
  await row(patrick, 'demo-seconds', 'Demo Seconds', 'Demo Seconds')
  const [m] = await db.insert(t.matches).values({
    gameId: 'imp:demo-twin-game', status: 'FINAL', type: 'oneDay', seasonName: season.name, seasonStartYear: season.startYear, competitionName: '', gradeName: 'Demo Seconds', localDate: `${season.startYear}-11-08`,
    startsAt: `${season.startYear}-11-08T12:00:00.000Z`, days: 1, clubTeamId: 'import:demo-seconds', clubTeamName: 'Demo Seconds', opponentName: 'Demo Rovers', result: 'won', source: 'import', importBatch: 'imp-demo', sourceHash: 'demo', createdAt: stamp, updatedAt: stamp,
  }).returning({ id: t.matches.id })
  for (const [i, [id, key]] of ([[pat, 'pat|twin'], [patrick, 'patrick|twin']] as const).entries()) {
    await db.insert(t.match_appearances).values({ match: m.id, appearanceId: `i${i + 1}`, teamId: 'import:demo-seconds', isClubSide: true, player: id, nameKey: key, createdAt: stamp, updatedAt: stamp })
  }
  // A merge done through the real code: the merge log (and its Undo) comes from it.
  const mergeTarget = await person('Sam', 'Mergeable')
  const mergeSource = await person('Sammy', 'Mergeable')
  await row(mergeTarget, 'demo-b', 'Demo B', 'Demo B Grade', 5)
  await row(mergeSource, 'demo-b', 'Demo B', 'Demo B Grade', 3)
  const merged = await mergePlayerInto(payload, { sourceId: mergeSource, targetId: mergeTarget, userId: null })
  if (!merged.ok) throw new Error(`[seed-demo] demo merge failed: ${merged.message}`)

  // One label rename: the Seconds are shown as Demo B Grade everywhere.
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  if (!settings?.stats?.labelRenames?.length) {
    await payload.updateGlobal({ slug: 'site-settings', data: { stats: { ...(settings?.stats ?? {}), labelRenames: [{ kind: 'grade', from: 'Demo Seconds', to: 'Demo B Grade' }] } } as never, context: CTX })
  }
  // A preferred name (a nickname) on a demo player, and a hand-written (not AI) season summary.
  const alex = await payload.find({ collection: 'players', where: { and: [{ firstName: { equals: 'Alex' } }, { lastName: { equals: 'Turner' } }] }, limit: 1, depth: 0, overrideAccess: true })
  if (alex.docs[0] && !alex.docs[0].preferredName) await payload.update({ collection: 'players', id: alex.docs[0].id, data: { preferredName: 'Turbo' }, overrideAccess: true, context: CTX })
  const book = await payload.find({ collection: 'yearbooks', where: { seasonName: { equals: season.name } }, limit: 1, depth: 0, overrideAccess: true })
  if (book.docs[0] && !book.docs[0].seasonSummary) {
    await payload.update({
      collection: 'yearbooks', id: book.docs[0].id, overrideAccess: true, context: CTX,
      data: { seasonSummary: 'A season of steady progress. The first grade side finished strongly and the seconds were the surprise of the year.\n\nThanks to every volunteer who kept the club running.' },
    })
  }
  console.log('[seed-demo] admin tools: duplicate pair, same-game pair, one real merge, label rename, preferred name and season summary created')
}

async function main() {
  await guard({ write: true })
  if (blobToken()) throw new Error('[seed-demo] refusing to run with a Blob token: demo files go to local disk only')
  const payload = await getPayload({ config })
  const mediaByFile = new Map<string, number>()
  /** One `media` doc per public file (sponsor logos are shared between tiers). */
  const mediaFor = async (rel: string, alt: string): Promise<number | null> => {
    const filePath = path.join(PUBLIC, rel)
    if (!existsSync(filePath)) return null
    if (!mediaByFile.has(rel)) {
      const doc = await payload.create({ collection: 'media', data: { alt }, filePath, overrideAccess: true, context: CTX })
      mediaByFile.set(rel, doc.id)
    }
    return mediaByFile.get(rel)!
  }

  try {
    console.log(`[seed-demo] club global: ${await seedClubGlobal(payload)}`)
    const sample = process.argv.includes('--theme-sample') ? process.argv[process.argv.indexOf('--theme-sample') + 1] : undefined
    if (sample && sample !== 'blue') throw new Error(`Unknown --theme-sample "${sample}" (only "blue" exists)`)
    console.log(`[seed-demo] theme global: ${await seedThemeGlobal(payload, sample === 'blue' ? { sample: 'blue', force: true } : {})}`)

    await seedCollection(payload, 'documents', async () => {
      let n = 0
      for (const d of DEMO_DOCUMENTS) {
        const filePath = path.join(PUBLIC, 'assets/documents', d.file)
        if (!existsSync(filePath)) continue
        try {
          await payload.create({ collection: 'documents', data: { title: d.title, category: d.category }, filePath, overrideAccess: true, context: CTX })
          n++
        } catch (err) {
          // e.g. a PDF that fails Payload's integrity check (WP2 findings).
          console.warn(`[seed-demo] documents: skipped ${d.file}: ${(err as Error).message}`)
        }
      }
      return n
    })

    await seedCollection(payload, 'gallery-photos', async () => {
      const files = demoGalleryFiles(readdirSync(path.join(PUBLIC, 'assets/gallery')))
      for (const [i, f] of files.entries()) {
        await payload.create({
          collection: 'gallery-photos',
          data: { caption: '', sortOrder: i },
          filePath: path.join(PUBLIC, 'assets/gallery', f),
          overrideAccess: true,
          context: CTX,
        })
      }
      return files.length
    })

    await seedCollection(payload, 'sponsors', async () => {
      const rank: Record<string, number> = {}
      for (const s of DEMO_SPONSORS) {
        const logo = s.logo ? await mediaFor(`assets/sponsors/${s.logo}`, `${s.name} logo`) : null
        await payload.create({
          collection: 'sponsors',
          data: { name: s.name, tier: s.tier, logo, linkUrl: s.linkUrl, sortOrder: (rank[s.tier] = (rank[s.tier] ?? -1) + 1) },
          overrideAccess: true,
          context: CTX,
        })
      }
      return DEMO_SPONSORS.length
    })

    await seedCollection(payload, 'people', async () => {
      for (const [i, p] of DEMO_PEOPLE.entries()) {
        await payload.create({ collection: 'people', data: { ...p, sortOrder: i }, overrideAccess: true, context: CTX })
      }
      return DEMO_PEOPLE.length
    })

    await seedCollection(payload, 'announcements', async () => {
      await payload.create({
        collection: 'announcements',
        data: { title: 'Welcome to the new season', body: 'Training starts Tuesday at 5:30pm at the Lang Lang Recreation Reserve. New players welcome.', published: true },
        overrideAccess: true,
        context: CTX,
      })
      return 1
    })

    await seedCollection(payload, 'events', async () => {
      const today = new Date()
      const cover = await mediaFor('assets/branding/hero.jpg', 'Lang Lang Cricket Club ground')
      await payload.create({
        collection: 'events',
        data: {
          type: 'one_time',
          title: 'Season Launch BBQ',
          description: 'Families, players and sponsors welcome. Sausages, salads and a few overs in the nets.',
          location: 'Lang Lang Recreation Reserve',
          cover,
          eventTime: '18:00',
          eventDate: utcMidnight(addDays(today, 21)),
          mealOptions: [{ label: 'Beef' }, { label: 'Vegetarian' }],
        },
        overrideAccess: true,
        context: CTX,
      })
      await payload.create({
        collection: 'events',
        data: {
          type: 'recurring',
          title: 'Junior Training',
          description: 'Under 10s to Under 16s. Bring a water bottle and a hat.',
          location: 'Lang Lang Recreation Reserve nets',
          eventTime: '17:30',
          dayOfWeek: '2',
          startDate: utcMidnight(today),
          endDate: utcMidnight(addDays(today, 120)),
        },
        overrideAccess: true,
        context: CTX,
      })
      return 2
    })

    await seedCollection(payload, 'stories', async () => {
      const html =
        '<p>The club was formed by local farmers who wanted a game on Saturday afternoons. ' +
        'The first matches were played on a paddock behind the hall.</p>' +
        '<h2>The ground</h2><p>The current oval was levelled by volunteers, and the nets followed a few seasons later.</p>'
      await payload.create({
        collection: 'stories',
        data: {
          title: 'How it all started',
          content: await htmlToLexical(html, payload.config),
          authorName: 'Club historian',
          status: 'published',
        },
        overrideAccess: true,
        context: CTX,
      })
      return 1
    })

    await seedCollection(payload, 'pages', async () => {
      for (const p of DEMO_PAGES) {
        const content = []
        for (const b of p.blocks) {
          if (b.type === 'text') content.push({ blockType: 'text' as const, richText: await htmlToLexical(b.html, payload.config) })
          else if (b.type === 'image') {
            const image = await mediaFor(b.file, b.alt)
            if (image) content.push({ blockType: 'image' as const, image, alt: b.alt, caption: b.caption ?? '', width: b.width ?? 'wide' })
          } else content.push({ blockType: 'cta' as const, label: b.label, url: b.url, style: b.style ?? 'primary', note: b.note ?? '' })
        }
        await payload.create({
          collection: 'pages',
          data: { title: p.title, status: p.status, showInNavigation: p.showInNavigation, navOrder: p.navOrder, navLabel: p.navLabel ?? '', content },
          overrideAccess: true,
          context: CTX,
        })
      }
      return DEMO_PAGES.length
    })

    await seedCollection(payload, 'news', async () => {
      const now = Date.now()
      for (const n of DEMO_NEWS) {
        await payload.create({
          collection: 'news',
          data: {
            title: n.title,
            status: n.status,
            // A draft keeps no date (it is stamped when published); a scheduled post has a future one.
            publishedAt: n.status === 'published' ? new Date(now + n.daysFromNow * 86_400_000).toISOString() : undefined,
            cover: n.cover ? await mediaFor(n.cover, n.title) : null,
            excerpt: n.excerpt,
            body: await htmlToLexical(n.html, payload.config),
            author: n.author,
          },
          overrideAccess: true,
          context: CTX,
        })
      }
      return DEMO_NEWS.length
    })

    await seedCollection(payload, 'players', async () => {
      const players = [
        { firstName: 'Bill', lastName: 'Lawry', manualYears: '1958–1971', honours: [{ years: '1965', title: 'Premiership Captain' }, { years: '', title: 'Life Member' }] },
        { firstName: 'Alex', lastName: 'Turner', manualYears: '2019–', honours: [] },
      ]
      for (const p of players) {
        await payload.create({ collection: 'players', data: { ...p, bio: '' }, overrideAccess: true, context: CTX })
      }
      return players.length
    })

    await seedDemoMatches(payload)
    await seedDemoStatLab(payload)
    await seedDemoAdminTools(payload)
  } finally {
    await payload.destroy()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
