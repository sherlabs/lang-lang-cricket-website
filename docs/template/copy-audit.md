# Copy and asset audit

Run on 2026-10-13 against this branch. The search was a case-insensitive grep for `lang lang`, `langlang`, `llcc`, `caldermeade`, `cardinia`, `ccca`, `victoria`, `melbourne`, `gippsland`, `westernport`, `shire`, the Lang Lang email, the PlayHQ organisation id and the production host over `app components lib payload config scripts tests public docs README.md DESIGN.md CLAUDE.md` (without `node_modules`, `.next` and migration history).

Classes: **A** allowed (comment, preset, migration history, test fixture, development default), **B** code or config changed by the template work, **C** shipped asset, **D** documentation prose.

## Class B: changed

| Where | What it was | Now |
| --- | --- | --- |
| `payload/seed/club-defaults.ts` | The Lang Lang copy | Picks a set by `CLUB_PRESET`; the words moved verbatim to `payload/seed/presets/lang-lang.ts`; neutral copy comes from `buildClubDefaults` in `payload/seed/club-template.ts`. |
| `payload/globals/Club.ts` | Lang Lang text as column `DEFAULT`s in the database | Function defaults; the migration `template_neutral_club_defaults` drops the column defaults. A blank migrated database carries no club text (an integration test scans `information_schema`). |
| `lib/documents.ts`, enum `documents.category` | `CCCA Directory` | `Association directory` (a value rename that keeps rows); the heading visitors see comes from `club.associationLabel`. |
| `lib/site-settings-core.ts` | `ccca` honour keyword | Removed; `club.honourKeywords` adds a club's own words. The migration's data step writes `ccca` into Lang Lang's saved club row (only when that row exists), so its honours keep classifying. |
| `lib/structured-data.ts` | `MELBOURNE`, `melbourneIso` | `CLUB_TZ`, `clubIso`. |
| `config/site.ts` | Cookie prefix default `llcc` everywhere | `llcc` is a development and test fallback only; production default is the neutral `club`. |
| `public/googlef3f9083034ceae06.html` | A committed Search Console token | Deleted; served from env `GOOGLE_SITE_VERIFICATION_FILE`. |
| `components/site-footer.tsx` | Agency credit always shown; funding line always shown | Credit hidden by `AGENCY_CREDIT=off`; empty funding line renders nothing. |
| `payload/scripts/etl/steps/documents.ts` | Passed the legacy category through | Maps `CCCA Directory` to `Association directory`. |

## Class A: allowed

- `payload/seed/presets/lang-lang.ts` (the preset), `payload/seed/theme-defaults.ts` (seed colours), `payload/scripts/` and `payload/seed/demo-*` (Lang Lang demo data).
- `config/site.ts`: the one allowed home of the Lang Lang host, organisation id and team prefix, as development and test defaults only.
- `payload/migrations/`: history. `scripts/check-migrations.mjs`: names the local databases.
- Comments that explain history (cookie names, ETL notes).
- Tests: fixtures and expectations built on Lang Lang data (about 90 files). The three tests that pin the Lang Lang defaults import the preset explicitly.
- `.env.example`: Lang Lang's values as the documented example.
- `docs/superpowers/`: specs and plans.

## Class C: shipped assets

`public/favicon.ico`, `public/apple-touch-icon.png`, `public/og-image.jpg`, `public/assets/branding/*`, `public/assets/documents`, `public/assets/gallery`, `public/assets/sponsors` are Lang Lang's own files and stay in this repository as its fallbacks. A new club's profile uploads its own logo, hero, share image and favicon (Club details); `pnpm check:template` lists every file under `public/` that still matches a Lang Lang original by content, and `tests/branding-files.test.ts` blocks reuse on another host. Remaining static icons (`public/favicon.ico`, `apple-touch-icon.png`) have no admin upload: replace the files in your copy.

## Class D: documentation

`README.md`, `DESIGN.md`, `CLAUDE.md` and the older feature docs describe this deployment and name Lang Lang as the worked example. The template documentation is `docs/template/`.

## Dry grep of the rendered neutral site

With `CLUB_PRESET=template` and the fictional Riverbend profile applied, the home, contact, history, share-your-story, documents, sponsors, people, gallery, events, announcements, players, stats, records, honours, yearbooks, matches, statlab, news and selector sign-in pages, their metadata, `/sitemap.xml`, `/robots.txt` and the fixtures page were rendered and searched for the tokens above.

| Hit | Class | Resolution |
| --- | --- | --- |
| `/matches` link to a PlayHQ page of another club | A | `PLAYHQ_CLUB_URL` falls back to Lang Lang's page in development and test only (production falls back to `https://www.playhq.com`). The integration test sets `PLAYHQ_CLUB_URL`. |
| Home page copy named the placeholder club ("Your town") | B | The home, page and menu copy is not stored in the database, so the template now builds it from the saved club identity (`defaultsForClub`). |
| Cookie prefix | A | Not rendered in markup; the test sets `COOKIE_PREFIX`. |

After the fixes the scoped assertion (visible text, `generateMetadata` output and JSON-LD) finds none of `lang lang`, `caldermeade`, `llcc` or `ccca`. Static fallbacks such as `/favicon.ico`, `/og-image.jpg` and `/assets/branding/*` paths can appear in attribute values and are not counted.
