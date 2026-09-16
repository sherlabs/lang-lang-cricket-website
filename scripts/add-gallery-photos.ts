import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { galleryPhotos } from '../db/schema'

// Idempotent: inserts a row for every image in public/assets/gallery that the DB
// doesn't already know about. New photos go to the front (sortOrder 0..n-1) so
// they show first on the homepage and gallery; existing rows are shifted back.
// Pass --append to add them at the end instead.
async function main() {
  const append = process.argv.includes('--append')
  const dir = join(process.cwd(), 'public', 'assets', 'gallery')
  const files = readdirSync(dir)
    .filter((f) => /^photo-\d+\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()

  const existing = await db.select({ url: galleryPhotos.url, sortOrder: galleryPhotos.sortOrder }).from(galleryPhotos)
  const known = new Set(existing.map((r) => r.url))
  const fresh = files.map((f) => `/assets/gallery/${f}`).filter((url) => !known.has(url))

  if (fresh.length === 0) {
    console.log('Gallery already up to date.')
    return
  }

  const maxExisting = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1)
  const start = append ? maxExisting + 1 : 0
  if (!append && existing.length > 0) {
    await db.update(galleryPhotos).set({ sortOrder: sql`${galleryPhotos.sortOrder} + ${fresh.length}` })
  }
  const rows = fresh.map((url, i) => ({ url, caption: '', sortOrder: start + i }))
  await db.insert(galleryPhotos).values(rows)
  console.log(`Inserted ${rows.length} gallery photos (sortOrder ${start}–${start + rows.length - 1}, ${append ? 'appended' : 'prepended'}).`)
}

main()
