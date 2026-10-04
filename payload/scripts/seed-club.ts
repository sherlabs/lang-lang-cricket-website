/**
 * Seeds the `club` global from payload/seed/club-defaults.ts (spec §4.1) and the `theme` global from
 * payload/seed/theme-defaults.ts.
 *   pnpm seed:club --target 127.0.0.1/langlang_dev --confirm [--force]
 * A saved global is left alone unless --force. Logo and OG image stay unset, so the site
 * keeps its static fallbacks until an admin uploads replacements.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { CANONICAL_HOST } from '../../config/site'
import { clubDefaults } from '../seed/club-defaults'
import { seedClubGlobal } from '../seed/seed-club-global'
import { seedThemeGlobal } from '../seed/seed-theme-global'
import { guard } from './_guard'

async function main() {
  await guard({ write: true })
  const payload = await getPayload({ config })
  try {
    const result = await seedClubGlobal(payload, { force: process.argv.includes('--force') })
    console.log(
      result === 'skipped'
        ? '[seed-club] the club global is already saved; nothing to do (pass --force to overwrite it with the defaults)'
        : `[seed-club] club global ${result} from the defaults`,
    )
    const force = process.argv.includes('--force')
    console.log(`[seed-club] theme global ${await seedThemeGlobal(payload, { force })} (Lang Lang colours and font; the crest falls back to the Club details logo)`)
    const canonical = CANONICAL_HOST
    const club = await payload.findGlobal({ slug: 'club', depth: 0 })
    const host = new URL(club.siteUrl || clubDefaults.siteUrl).host
    if (host !== canonical) {
      console.warn(`[seed-club] warning: club.siteUrl host "${host}" differs from CANONICAL_HOST "${canonical}" (redirects use CANONICAL_HOST)`)
    }
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
