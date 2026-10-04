/**
 * Seeds the `club` global from payload/seed/club-defaults.ts (spec §4.1) and the `theme` global from
 * payload/seed/theme-defaults.ts.
 *   pnpm seed:club --target 127.0.0.1/langlang_dev --confirm [--force] [--only theme]
 * A saved global is left alone unless --force. `--only theme` touches the theme global and nothing else,
 * so `--only theme --force` resets the colours and font without overwriting Club details. Logo and OG image stay unset, so the site
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
    const force = process.argv.includes('--force')
    const onlyIdx = process.argv.indexOf('--only')
    const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined
    if (only !== undefined && only !== 'theme') throw new Error(`[seed-club] unknown --only value "${only}" (the only supported value is "theme")`)
    if (only !== 'theme') {
      const result = await seedClubGlobal(payload, { force })
      console.log(
        result === 'skipped'
          ? '[seed-club] the club global is already saved; nothing to do (pass --force to overwrite it with the defaults)'
          : `[seed-club] club global ${result} from the defaults`,
      )
    }
    console.log(`[seed-club] theme global ${await seedThemeGlobal(payload, { force })} (Lang Lang colours and font; the crest falls back to the Club details logo)`)
    if (only === 'theme') return
    const canonical = CANONICAL_HOST
    const club = await payload.findGlobal({ slug: 'club', depth: 0 })
    const host = new URL(club.siteUrl || clubDefaults.siteUrl).host
    if (host !== canonical) {
      throw new Error(
        `[seed-club] club.siteUrl host "${host}" differs from CANONICAL_HOST "${canonical}". The site uses CANONICAL_HOST for canonical links; fix Club details > Site URL or the env so they agree.`,
      )
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
