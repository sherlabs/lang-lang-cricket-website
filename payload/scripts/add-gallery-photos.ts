/**
 * Adds every image in a folder that the gallery does not have yet (spec §11.6; replaces the
 * old scripts/add-gallery-photos.ts, which wrote to production by default).
 *
 *   pnpm payload run payload/scripts/add-gallery-photos.ts -- --target 127.0.0.1/langlang_dev --confirm
 *        [--dir public/assets/gallery] [--append]
 *
 * Files go through Payload (Blob in production, ./gallery-photos locally). New photos go to the
 * front in file-name order (below the current lowest sortOrder, without renumbering existing
 * rows); --append puts them after the current highest. Idempotent: a file whose name is
 * already a gallery filename, or whose site path (`/assets/gallery/<name>`, for the default
 * folder) is an ETL'd row's legacyUrl, is skipped. New rows get no `legacyUrl` (spec §3: it is
 * null for new uploads, so they are not treated as old-site files).
 */
import config from '@payload-config'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import { argValue, guard } from './_guard'

const IMAGE = /\.(jpe?g|png|webp)$/i

async function main() {
  await guard({ write: true })
  const append = process.argv.includes('--append')
  const dir = path.resolve(process.cwd(), argValue(process.argv, '--dir') ?? 'public/assets/gallery')
  const publicDir = path.resolve(process.cwd(), 'public')
  const files = readdirSync(dir).filter((f) => IMAGE.test(f)).sort()

  const payload = await getPayload({ config })
  try {
    const { docs } = await payload.find({
      collection: 'gallery-photos',
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { legacyUrl: true, filename: true, sortOrder: true },
    })
    const known = new Set(docs.flatMap((d) => [d.legacyUrl, d.filename]).filter(Boolean))
    const sitePath = (f: string) => (dir.startsWith(publicDir + path.sep) ? `/${path.relative(publicDir, path.join(dir, f)).split(path.sep).join('/')}` : null)
    const fresh = files.filter((f) => !known.has(f) && !known.has(sitePath(f) ?? ''))
    if (fresh.length === 0) {
      console.log('Gallery already up to date.')
      return
    }
    const orders = docs.map((d) => d.sortOrder ?? 0)
    const start = append ? (orders.length ? Math.max(...orders) + 1 : 0) : (orders.length ? Math.min(...orders) : 0) - fresh.length
    for (const [i, f] of fresh.entries()) {
      await payload.create({
        collection: 'gallery-photos',
        data: { caption: '', sortOrder: start + i },
        filePath: path.join(dir, f),
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    }
    console.log(`Added ${fresh.length} gallery photos (sortOrder ${start}–${start + fresh.length - 1}, ${append ? 'appended' : 'prepended'}).`)
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
