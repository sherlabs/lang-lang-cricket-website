import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { generateStatsSeed, SEED_MARKER } from './stats-seed-data'

/** Writes the deterministic stats seed through the Local API (shared by the script and the int tests). */
const CTX = { disableRevalidate: true } as const
export async function seedStats(payload: Payload): Promise<{ players: number; rows: number }> {
  await payload.delete({ collection: 'players', where: { bio: { like: SEED_MARKER } }, context: CTX })
  let rows = 0
  const seed = generateStatsSeed()
  for (const p of seed) {
    const created = await payload.create({
      collection: 'players',
      data: {
        firstName: p.firstName, lastName: p.lastName, hidden: p.hidden, source: 'manual', manualYears: p.manualYears,
        // Manual players are never "derived active"; whoever played the newest seeded season is active, so the public milestone strip has people.
        activeOverride: p.rows.some((r) => r.seasonName === 'Summer 2025/26') ? 'active' : 'past',
        bio: `${SEED_MARKER} Fixture player for local stats checks.`, honours: p.honours,
      },
      context: CTX,
    })
    for (const r of p.rows) {
      await payload.create({ collection: 'player-seasons', data: { player: created.id, ...r }, context: CTX })
      rows++
    }
  }
  return { players: seed.length, rows }
}


/** Seasons the yearbook seed owns; re-running replaces these two yearbooks and the seed sponsors. */
export const SEED_YEARBOOKS = { published: 'Summer 2025/26', draft: 'Summer 2024/25' } as const
const SEED_SPONSOR_LINK = 'https://example.com/seed-sponsor'

/**
 * One published yearbook (messages, sponsors, optionally photos) and one draft. Photos need real
 * files, so they are opt-in and read from `public/assets/gallery` (written to `./gallery-photos`
 * by the upload collection, with no Blob token set). Idempotent.
 */
export async function seedYearbooks(payload: Payload, opts: { photos?: boolean } = {}): Promise<{ yearbooks: number; photos: number }> {
  await payload.delete({ collection: 'yearbooks', where: { seasonName: { in: Object.values(SEED_YEARBOOKS) } }, context: CTX })
  await payload.delete({ collection: 'sponsors', where: { linkUrl: { equals: SEED_SPONSOR_LINK } }, context: CTX })
  const sponsors: number[] = []
  for (const [i, name] of ['Caldermeade Motors', 'Lang Lang Hardware'].entries()) {
    const s = await payload.create({ collection: 'sponsors', data: { name, tier: i === 0 ? 'Gold' : 'Silver', linkUrl: SEED_SPONSOR_LINK, sortOrder: i }, context: CTX })
    sponsors.push(s.id)
  }
  const photos: number[] = []
  const dir = path.join(process.cwd(), 'public/assets/gallery')
  if (opts.photos && existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png|webp)$/i.test(x)).sort().slice(0, 4)) {
      const p = await payload.create({ collection: 'gallery-photos', data: { caption: `Yearbook photo (${f})` }, filePath: path.join(dir, f), context: CTX })
      photos.push(p.id)
    }
  }
  await payload.create({
    collection: 'yearbooks',
    data: {
      title: '2025/26 Yearbook', seasonName: SEED_YEARBOOKS.published, status: 'published', premiership: 'A Grade premiers',
      presidentMessage: 'What a season it has been for the club.\n\nThank you to every volunteer who kept the canteen open and the pitches rolled.',
      coachMessage: 'The group worked hard all summer and it showed.',
      sponsorMessage: 'Our sponsors make everything possible. Thank you.',
      featuredSponsors: sponsors, photos,
    },
    context: CTX,
  })
  await payload.create({
    collection: 'yearbooks',
    data: { title: '2024/25 Yearbook (draft)', seasonName: SEED_YEARBOOKS.draft, status: 'draft', presidentMessage: 'Not ready to publish.' },
    context: CTX,
  })
  return { yearbooks: 2, photos: photos.length }
}
