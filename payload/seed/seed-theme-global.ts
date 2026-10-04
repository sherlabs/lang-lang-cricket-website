import type { Payload } from 'payload'
import { THEME_DEFAULTS, THEME_SAMPLE_BLUE } from './theme-defaults'

/**
 * Write the `theme` global from the seed values (`theme-defaults.ts`). Used by `seed:club`, `seed:demo`
 * and the ETL club step. A saved global (it has `updatedAt`) is left alone unless `force`. The crest is
 * not set here: the site falls back to the Club details logo, then the bundled crest. `sample: 'blue'`
 * writes the blue demo palette (local eyeballing of a second club look; never a default).
 */
export async function seedThemeGlobal(
  payload: Payload,
  opts: { force?: boolean; sample?: 'blue' } = {},
): Promise<'created' | 'updated' | 'skipped'> {
  const current = await payload.findGlobal({ slug: 'theme', depth: 0, overrideAccess: true })
  const exists = Boolean(current?.updatedAt)
  if (exists && !opts.force) return 'skipped'
  const source = opts.sample === 'blue' ? THEME_SAMPLE_BLUE : THEME_DEFAULTS
  await payload.updateGlobal({
    slug: 'theme',
    data: { palette: { ...source.palette }, shades: { ...source.shades }, headingFont: source.headingFont },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return exists ? 'updated' : 'created'
}
