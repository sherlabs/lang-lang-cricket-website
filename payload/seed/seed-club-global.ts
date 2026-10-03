import type { Payload } from 'payload'
import { clubGlobalSeed } from './club-defaults'

/**
 * Write the `club` global from the defaults module (spec §4.1). Used by `seed-club.ts` and the
 * ETL's club step. A saved global (it has `updatedAt`) is left alone unless `force`.
 * Upload fields (logo, OG image) are not set here: the frontend falls back to the static files.
 */
export async function seedClubGlobal(payload: Payload, opts: { force?: boolean } = {}): Promise<'created' | 'updated' | 'skipped'> {
  const current = await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })
  const exists = Boolean(current?.updatedAt)
  if (exists && !opts.force) return 'skipped'
  await payload.updateGlobal({
    slug: 'club',
    data: clubGlobalSeed() as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return exists ? 'updated' : 'created'
}
