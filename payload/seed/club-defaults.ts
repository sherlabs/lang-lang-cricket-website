/**
 * The active club identity and copy (spec §4.1, D9; wave F spec 5.2). The shape and the neutral builder live in
 * `club-template.ts`; Lang Lang's own words live in `presets/lang-lang.ts`. Which set is `clubDefaults` is chosen by
 * env `CLUB_PRESET`: `lang-lang` (the default in development and test) or `template` (neutral copy for a new club, the
 * default everywhere else). Consumers: the `club` global's field defaults, `seed-club.ts`, the bootstrap script and
 * `getClub()`, which merges the saved global over these values.
 *
 * Pure data: no Payload, React or Next imports (the frontend and the admin both import it).
 */
import { allowSeedFallbacks } from '../../config/site'
import { buildClubDefaults, toClubGlobal, type ClubDefaults, type ClubGlobalDefaults, type ClubIdentity } from './club-template'
import { langLangDefaults } from './presets/lang-lang'

export * from './club-template'

/** Identity of the neutral template set (used until a club is bootstrapped; every field is editable in the admin). */
export const TEMPLATE_IDENTITY: ClubIdentity = {
  name: 'Your Cricket Club',
  shortName: 'Your CC',
  familiarName: 'the club',
  location: 'Your town',
  siteUrl: 'https://example.com',
  locale: 'en-AU',
  ogLocale: 'en_AU',
  email: 'info@example.com',
  address: { locality: 'Your town', region: '', regionName: '', country: 'AU', countryName: 'Australia' },
}

export const CLUB_PRESETS = ['lang-lang', 'template'] as const
export type ClubPreset = (typeof CLUB_PRESETS)[number]

/** `CLUB_PRESET` from env: unset means Lang Lang in development and test and the neutral template everywhere else. */
export function resolveClubPreset(e: Record<string, string | undefined> = process.env): ClubPreset {
  const v = e.CLUB_PRESET?.trim()
  if (v === 'lang-lang' || v === 'template') return v
  return allowSeedFallbacks(e) ? 'lang-lang' : 'template'
}

export function clubDefaultsFor(preset: ClubPreset): ClubDefaults {
  return preset === 'lang-lang' ? langLangDefaults : buildClubDefaults(TEMPLATE_IDENTITY)
}

export const clubDefaults: ClubDefaults = clubDefaultsFor(resolveClubPreset())

/** The admin-editable subset of the active set, as `seed-club.ts` writes it. */
export const clubGlobalSeed = (d: ClubDefaults = clubDefaults): ClubGlobalDefaults => toClubGlobal(d)
