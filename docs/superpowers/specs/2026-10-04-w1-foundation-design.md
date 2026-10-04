# W1 foundation: theme system, per-match data store, pages and news (design)

Date: 2026-10-04. Branch: feat/payload-cms. Tracking issue: #38. Work packages, in build order:

| WP | Issue | One line |
| --- | --- | --- |
| WP-T Theme system | #14 | Colours, crest and display font come from a `theme` global, not code. |
| WP-M Per-match data store | #2 | Every PlayHQ game, innings, batting, bowling and fielding row is stored, idempotently, linked to players through the alias system. |
| WP-P Pages and news | #22 | Committee-editable info pages and news posts, with menu entries that need no developer. |

Product goal (applies to every WP): this repository is reused for other cricket clubs. Anything club-specific (colours, crest, fonts, names, copy, hosts) comes from configuration, never from app, component or OG-route code. Lang Lang's current values become the seed defaults, so the Lang Lang site looks identical after W1 (two intentional deltas are called out and accepted: the stat card font, T3, and the admin-only success ramp, T3).

Everything below was checked against the code on this branch unless marked **(verify)**. Later waves (W2+) build on the interfaces in section 4.

**Revision 2.** A 31-point review of this spec was applied. Valid findings are folded into the text below; the few rejected or partly accepted ones are listed with reasons in Appendix A. Notable scope cuts: no `navigation` global, three page blocks (not seven), no partnership or head-to-head queries, no `deriveShades`, no per-run match cap.

## 0. Rules that hold for the whole spec

**The config seam (stated once).** A value comes from a Payload global when it is only needed at request time and a committee or designer should be able to change it. It stays in environment variables plus `config/site.ts` when it is read before the database exists or in module scope. That second group is: `next.config.ts` (canonical and redirect hosts, `outputFileTracingIncludes`), `payload.config.ts` (`admin.meta`, favicon), `COOKIE_PREFIX`, `CLUB_TIMEZONE` and `CLUB_LOCALE` (used by pure libs at module scope), `PLAYHQ_ORG_ID` and `PLAYHQ_TEAM_PREFIX` (read in `lib/playhq/client.ts` at import), `CANONICAL_HOST` and `EXPORT_FILENAME_PREFIX`. `config/site.ts` is therefore the one per-club build file. **Lang Lang values are development and test defaults only**: in production (`VERCEL_ENV === 'production'`) `config/site.ts` has no fallback for `PLAYHQ_ORG_ID`, `PLAYHQ_TEAM_PREFIX` and `CANONICAL_HOST`, and an assertion (`assertClubEnv()`, called from `instrumentation.ts`, not at build) throws with a plain message when any is unset, so a new club that forgets env can never silently serve Lang Lang's live PlayHQ data. The values move to `.env.example` and Lang Lang's Vercel env, and setting them is a **blocker line** in the cutover checklist (`docs/superpowers/plans/2026-10-03-payload-cutover-checklist.md`, text edit made by WP-T).

**Commits and safety.** Conventional commits with explicit paths, no push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. All DB work is local (127.0.0.1, `langlang_dev`, `langlang_test`, `langlang_mig`). PlayHQ calls are read-only GETs, sequential, from fixtures wherever possible.

**Migrations.** One migration per WP (`pnpm payload migrate:create <name>`), schema-qualified, `.ts` and `.json` committed; `pnpm generate` then `git add payload-types.ts "app/(payload)/admin/importMap.js"` so `pnpm check:generated` passes; `pnpm check:migrations` replays on `langlang_mig`.

**Committee-admin classification.** Every new collection or global gets `admin.group: false`, plain labels, helper text and an entry in `payload/admin/navigation.ts`. Admin-only things go under `advancedNav` with `admin.hidden: hiddenFromEditors`. Details per WP.

**Implementation order inside W1.** Before touching code, capture the "before" screenshots (WP-T section T5b). Then WP-T, WP-M, WP-P, one commit per logical step, the full vitest suite and one `next build` only in the final Verify step.

---

## 1. WP-T Theme system (issue #14)

### T1. Hard-coded club values found (full inventory)

Colour and font leaks (all must move):

| # | Where | What | Disposition |
| --- | --- | --- | --- |
| 1 | `config/brand.ts` | The 12 brand hex values; Tailwind and the stat card both import them | Hex moves to `payload/seed/theme-defaults.ts` (the only file allowed to hold them). `config/brand.ts` keeps only the key list and the Tailwind `rgb(var(--brand-x) / <alpha-value>)` map. |
| 2 | `tailwind.config.ts` `boxShadow.card` and `card-hover` | `rgba(11,11,13,...)` tint | `rgb(var(--brand-black) / 0.04)` and friends. |
| 3 | `app/(frontend)/globals.css` lines 83, 87, 98, 99 | `#f5b700` focus outline and selection, `#0b0b0d` selection text | `rgb(var(--brand-gold))`, `rgb(var(--brand-black))`. |
| 4 | `app/(frontend)/globals.css` lines 287-294 (yearbook print) and 120-121 (marquee mask) | `#fff`, `#000` | Legitimate (print paper, mask alpha). Not brand colours; allowed by the guard. |
| 5 | `components/events/event-placeholder-art.tsx` | `GOLD = ['#F5B700','#C99400','#FFD966']` and `#0B0B0D` (lines 15, 61, 71, 100) | `style={{ fill: 'rgb(var(--brand-gold))' }}` and `stopColor` via style (presentation attributes with `var()` are not reliable in every browser, `style` is). |
| 6 | `app/api/public/players/[slug]/card/route.tsx` | `BRAND.*` constants, literal `#ffffff` and `#ffffffbf`, no font loaded (next/og default) | Use `resolveTheme()`, `themedImageResponse()` and the font loader. White and `#ffffffbf` are neutral constants (`WHITE`, `WHITE_75`) named once in `lib/theme/og.tsx`; they are not theme values (no `ResolvedTheme.white`) and the guard allows `#ffffff` with alpha, so there is no contradiction. |
| 7 | `payload/components/admin.css` lines 4-16, 45, 432-436, 599 | `--club-gold`, `--club-gold-light`, `--club-black`, ten `--color-success-*` hex steps, cream, stone, charcoal, grey, gold-deep, and the `rgb(11 11 13 / ...)` literals at lines 45 and 599 | Variables read the theme (section T3); the ten-step ramp is built with `color-mix()` in `admin.css` from the theme variables (T3 "Admin ramp"). The inventory is re-grepped for `rgb(` and `hsl(` across `payload/components` and `app` at implementation time, and the guard (c) fails on any remaining channel literal. Remaining `#fff` is neutral white, allowed. The prose comment at lines 429-430 that lists the brand hex is reworded (the guard strips `/* */` blocks before scanning). |
| 8 | `app/(frontend)/shell.tsx` | `Inter` and `Barlow_Condensed` from `next/font/google` | Heading font becomes the chosen bundled face (T4). Inter stays as the structural body font. |
| 9 | `components/stats/*`, `components/**` generally | Only Tailwind classes (`bg-brand-gold` etc.) | No change; classes keep their names, the values behind them change source. |

Club-specific names, hosts and defaults (move to config or the club global where not yet done):

| # | Where | Value | Disposition |
| --- | --- | --- | --- |
| 10 | `app/(frontend)/statlab/export/route.ts:21` | filename `langlang-statlab-<scope>.csv` | `${EXPORT_FILENAME_PREFIX}-statlab-<scope>.csv`; env `EXPORT_FILENAME_PREFIX`, falling back to `slugify(club.shortName)` for a new club. Lang Lang sets `EXPORT_FILENAME_PREFIX=langlang` so the filename is unchanged (deriving from `shortName` would give `lang-lang-cc-`, a visible delta). |
| 11 | `app/(frontend)/stats/page.tsx:44` | inline `'en-AU'` and `'Australia/Melbourne'` | Use `CLUB_LOCALE` and `CLUB_TIMEZONE`. |
| 12 | `payload/components/ApprovalsView.tsx:6`, `lib/events-format.ts:5`, `lib/event-occurrences.ts:58`, `lib/structured-data.ts:25`, `lib/stats/milestones.ts:142,146` | literal `'en-AU'` | `CLUB_LOCALE` (env `CLUB_LOCALE`, default `en-AU`). |
| 13 | `config/site.ts` `CLUB_TIMEZONE`, `CLUB_LOCALE`, `COOKIE_PREFIX = 'llcc'` | constants | Read env (`CLUB_TIMEZONE`, `CLUB_LOCALE`, `COOKIE_PREFIX`) with today's values as defaults. Lang Lang keeps `llcc` so saved visitor state is not reset. |
| 14 | `next.config.ts:15` | default `REDIRECT_HOSTS` is `www.langlangcricketclub.com,lang-lang-cricket-website.vercel.app` | **Not changed by W1 code until the checklist line exists.** The default changes to `www.${canonical}` only in the same commit that adds a cutover-checklist **blocker** ("set `REDIRECT_HOSTS` in Vercel production before deploying, else the vercel.app 308 is lost"). Until then the old default stays. |
| 15 | `config/site.ts` `DEFAULT_CANONICAL_HOST` | `langlangcricketclub.com` | Env `CANONICAL_HOST`; the Lang Lang value is a non-production default only (section 0 assertion). |
| 16 | `config/site.ts` `PLAYHQ_DEFAULTS` (orgId, clubUrl, teamNamePrefix) | Lang Lang's org | Env first (`PLAYHQ_ORG_ID`, `PLAYHQ_CLUB_URL`, `PLAYHQ_TEAM_PREFIX`); Lang Lang values are non-production defaults only and the production assertion in section 0 applies. `teamNamePrefix` stays its own setting: it cannot derive from `club.shortName` ("Lang Lang CC" versus the PlayHQ prefix "Lang Lang"). |
| 17 | `payload.config.ts:55` | favicon `/assets/branding/logo.png` | Constant `BRANDING.logo` in `config/site.ts` (config-time, cannot read the DB). |
| 18 | `next.config.ts:28` and card route `BUNDLED_CREST` | `./public/assets/branding/logo.png` | `BRANDING.logo`. |
| 19 | `payload/seed/club-defaults.ts` | names, copy, assets, nav | Already the club seam; unchanged. `adminTitleSuffix` reads `clubDefaults.name`, fine (config-time). |
| 20 | `payload/collections/Sponsors.ts:37`, `Events.ts:123` | placeholders "e.g. Lang Lang Hardware", "e.g. Lang Lang Recreation Reserve" | Generic placeholders ("e.g. Smith's Hardware", "e.g. the clubrooms"). |
| 21 | `payload/scripts/seed-demo.ts` | demo sponsors, people, emails, `Lang Lang Recreation Reserve` | Demo data only; left, but a header comment says it is Lang Lang demo content and a new club replaces the arrays. |
| 22 | `components/site-footer.tsx` agency credit (sherlabs) | template constant | Stays (`AGENCY_CREDIT`); `utm_source` already uses the club host. |
| 23 | `lib/playhq/types.ts`, `lib/players/view.ts` comments | "Lang Lang" in comments only | Reword comments. |
| 24 | `payload/components/Logo.tsx`, admin login | uses `club.logo` or the static crest | Reads `getTheme().crest` (crest chain below). |

Per-club static files in `public/` (`assets/branding/hero.jpg`, `og-image.jpg`, `apple-touch-icon.png`, `assets/branding/logo.png`) and `app/favicon.ico` are club assets referenced by path from `club-defaults.ts` and `config/site.ts` (`BRANDING`); they stay as files in W1 (the share image is already overridable through `club.ogImage`, the hero through the home defaults) and a new club replaces the files.

Crest chain (single resolution point): only `getTheme()` / `resolveTheme()` resolves the crest: `theme.crest`, then the legacy `club.logo` (no data migration), then `BRANDING.logo`. `getClub().logoUrl` is **unchanged** (it stays the legacy Club details logo, no theme read, no circularity). The consumers that want "the crest" (nav, footer, JSON-LD, OG card, admin logo) switch to `theme.crest.url`; `lib/club-merge.ts` and `lib/club.ts` are not edited. `getTheme()` reads the club logo URL itself and passes it to `resolveTheme` as `clubLogoUrl`.

### T2. The `theme` global

File: `payload/globals/Theme.ts`, slug `theme`, label "Site look (colours and fonts)". Access: read `anyone` (layouts read it; REST exposure is harmless public styling), update `isAdmin`. `admin.group: false`, `admin.hidden: hiddenFromEditors`, entry in `advancedNav` (`{ key: 'theme', label: 'Site look (colours and fonts)', path: '/globals/theme' }`). `afterChange`: `revalidatePaths(['/'], req.context, [], { layout: true })` (same as `club`).

Fields (all with defaults from `payload/seed/theme-defaults.ts`, so a database with no saved theme still renders the seed values):

- `palette` group (the five roles a designer actually chooses). Hex, field `validate` `^#[0-9a-fA-F]{6}$` (a three-digit value is expanded, stored upper-case, by a `beforeValidate` field hook).
  - `primary` (`#0B0B0D`, CSS `--brand-black`): dark surface, headings, dark buttons.
  - `accent` (`#F5B700`, `--brand-gold`): CTAs, active nav, focus, selection.
  - `surface` (`#FAF7EF`, `--brand-cream`): alternate section band.
  - `text` (`#26262B`, `--brand-charcoal`): body text on light.
  - `muted` (`#5A5A62`, `--brand-grey`): secondary copy.
- `shades` group (always shown, grouped under "Other shades"): `ink` (`#17171A`), `accentDark` (`#C99400`), `accentLight` (`#FFD966`), `accentPale` (`#FFF4CC`), `accentDeep` (`#8A6500`), `surfaceMuted` (`#F3F1EA`, `--brand-stone`), `mutedLight` (`#6E6E76`, `--brand-grey-light`). All twelve colours are edited directly; there is no derive mode (no consumer asked for it and it could not reproduce the seed).
- `crest` upload to `media`: the club crest, a PNG with transparent background, at least 512 px. Helper text explains the white-tile treatment and that it falls back to the Club details logo, then the bundled crest.
- `headingFont` select over the fixed menu (T4); default `barlow-condensed`.
- A `ui` field `contrastReport` (client component `payload/components/ThemeContrast.tsx`, reads form values with `useFormFields`) lists each checked pair with its ratio and a pass/warn/fail marker, live as the designer edits.

Naming decision: CSS variables and Tailwind keys keep the `brand-*` names (about 900 class usages); the five role names exist only in the admin and in `resolveTheme()`. DESIGN.md section 13.2 records the mapping.

**Light/dark finish (scope decision).** `admin.theme: 'light'` is config-time and the public `.dark` CSS block is unused, so a real dark finish would need role-based surface variables across 900+ class usages. W1 ships no dark finish, no no-op select, no reserved `finish` field and no `surface-page`, `surface-card` or `text-body` aliases (nothing consumes them). A dark finish is a later issue (new, to be opened by whoever owns #14, not opened here); it would add the variable remap and the class migration together.

**Contrast checks (cheap, pure).** `lib/theme/contrast.ts`: `relativeLuminance`, `contrastRatio`, `checkTheme(colors)`. Pairs and levels:

| Pair (text on background) | Min | Level |
| --- | --- | --- |
| text on white; text on surface | 4.5 | error |
| muted on white; muted on surface | 4.5 | error |
| accentDeep on white; accentDeep on accentPale | 4.5 | error |
| primary (as text) on accent (button label) | 4.5 | error |
| white on primary; accent on primary; accentLight on primary (labels on dark) | 4.5 | error |
| mutedLight on white | 4.5 | warn |
| mutedLight on surfaceMuted | 4.5 | warn (today's 4.47, known issue 5 in DESIGN.md 13.4) |
| accent on white (focus ring, UI component) | 3 | warn |

Payload globals have no global-level `validate`, so the check is a `beforeValidate` **global hook** that runs `checkTheme()` on the merged data and throws a `ValidationError` (one message listing every failing `error` pair, in plain English, attached to the offending field paths); `warn` pairs only show in the report. The seed values must produce zero errors (test).

### T3. Plumbing

**Tailwind.** `config/brand.ts` exports `BRAND_KEYS` (the 12 names) and `BRAND_TW`, mapping each key to `rgb(var(--brand-<key>) / <alpha-value>)`. `tailwind.config.ts` sets `colors.brand = BRAND_TW`, so `bg-brand-gold/40`, `ring-brand-black/5` and gradient stops keep working (Tailwind 3.4 substitutes `<alpha-value>`). `boxShadow` uses `rgb(var(--brand-black) / x)`.

**CSS variable block.** `lib/theme/css.ts` `themeCss(theme)` returns `:root{--brand-black:11 11 13;...}` (twelve channel triples only). Only validated hex converted to channel triples ever reaches the string, so it is injection-safe; `resolveTheme()` falls back to the seed value for any invalid stored value. `components/theme-style.tsx` renders `<style id="club-theme" dangerouslySetInnerHTML>`.

**Frontend root.** `FrontendShell` (used by the `(frontend)` layout and `global-not-found`) calls `getTheme()` next to `getClub()` and renders `<ThemeStyle>` inside `<head>`. The heading font is set on `<body>` with `style={{ '--font-heading': 'var(--font-h-<key>)' }}`, because the face variables are defined by the next/font classes on `<body>` itself (a `:root` declaration would resolve before they exist).

**Admin root.** `app/(payload)/layout.tsx` renders `<ThemeStyle>` as a sibling before `children` inside Payload's `RootLayout` (children land in `<body>`). Chosen over `admin.components.providers` because it needs no importMap entry, does not depend on the provider contract of Payload 3.90.2, and runs before any admin client code. The file's "generated" banner is updated to say it is customised. `admin.css` replaces its hex with `rgb(var(--brand-...))` and builds the success ramp with `color-mix()`; the simple-admin cream look (`--club-cream`, `--club-stone`...) keeps its names and now reads the theme.

**Admin ramp.** No `ramp.ts`. `admin.css` defines `--color-success-50..500` with CSS `color-mix(in srgb, ...)` between the theme variables (50 = accent-pale, 200 = accent-light, 300 = accent, 400 = accent-dark, 500 = accent-deep, in-between steps are mixes of their neighbours). The five anchors are exact; the five in-between steps differ from today's hex by a few units per channel. That is the second accepted delta (admin only, not visible on the public site). At implementation, measure the worst channel error against the old ten values with the screenshot tool; if it exceeds 6 per channel, fall back to seeding the ten stops as an admin-only `adminRamp` field group instead.

**Other CSS.** Focus ring and selection use the variables (T1 item 3). Placeholder art uses style fills (item 5). The `.font-heading` rule gets `font-synthesis-weight: none`, so single-weight faces (Bebas Neue, Anton) are never faux-bolded by `font-bold` classes.

**Intentional visual deltas (two).** (1) The stat card currently renders with next/og's default font. In W1 it adopts the theme display font for the name and the numbers and a bundled Inter for labels, which matches the site better and is the proof that the font loader works. Before and after PNGs of one card go into the PR. (2) The admin success ramp in-between steps (see "Admin ramp"). The rest of the public site must be pixel-stable (T5).

### T4. Fonts (fixed menu, no network at render)

Files in `assets/fonts/` (new, committed): per face, static `.ttf` (satori and `next/og` read these; they cannot read woff2 or variable fonts) and `.woff2` subset (web delivery through `next/font/local`). Oswald and Playfair Display are **variable-only** on Google Fonts, so `assets/fonts/README.md` documents two steps per face: (1) `fonttools varLib.instancer <Variable>.ttf wght=700 -o <Name>-700.ttf` to cut each static weight, then (2) `pyftsubset <Name>-700.ttf --flavor=woff2 --unicodes="U+0000-00FF,U+0100-024F,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122"` (Latin plus Latin-extended, so names with diacritics render). The OG `.ttf` files are kept unsubsetted. `assets/fonts/LICENSES/*.txt` holds each OFL text and the README has the source URL and exact commands. All five are SIL Open Font License 1.1, which allows bundling and redistribution:

| key | Family | Weights bundled | Look |
| --- | --- | --- | --- |
| `barlow-condensed` (default, today's) | Barlow Condensed | 500, 600, 700 | Athletic condensed |
| `oswald` | Oswald | 700 (and 500) | Condensed, slightly softer |
| `bebas-neue` | Bebas Neue | 400 | Poster caps |
| `anton` | Anton | 400 | Heavy condensed |
| `playfair-display` | Playfair Display | 700 | Heritage serif, for traditional clubs |

OG body text uses bundled `Inter` 400 and 700 `.ttf` (OG only; the site keeps `next/font/google` Inter so body rendering does not change).

`lib/theme/fonts.ts` is the manifest (`FONT_MENU: Record<FontKey, { label, family, faces: { weight, ttf, woff2 }[], ogWeight, licence }>`) and is safe to import anywhere. `lib/theme/font-faces.ts` declares the five `localFont` instances at module scope (the next/font contract needs static literals), each with `variable: '--font-h-<key>'`, `preload: false` except the default, `display: 'swap'`, a system-ui fallback. All five variable classes go on `<body>`; the browser fetches only the `@font-face` that is actually used, so the cost of the unused four is a few hundred bytes of CSS. `lib/theme/fonts-server.ts` (`server-only`, `node:fs`) `loadThemeFonts(theme)` returns `{ name, data: ArrayBuffer, weight, style }[]` for satori, memoised per key. Routes that call it need the files in `outputFileTracingIncludes` (`./assets/fonts/**`), added in `next.config.ts` for the card route and any future OG route (pattern documented in section 4).

Parity risk: replacing `next/font/google` Barlow Condensed with bundled files could shift glyph hinting or metrics if the font version differs. Use the same upstream release as Google Fonts serves **(verify at download time)**; the screenshot step (T5b) covers it.

### T5. Tests and verification of visual parity

The old idea "Tailwind output byte-identical" cannot hold (utilities now reference variables). Replacements:

**(a) Seed equals previous values.** `tests/theme-seed.test.ts` (1) deep-equals `resolveTheme(null).colors` to a frozen literal copy of the 12 old hex values kept in the test file; (2) parses the `colors:` block of `DESIGN.md` front-matter and asserts the same 12 values, so DESIGN.md and the seed cannot drift; (3) asserts `checkTheme(seed)` has zero `error` results; (4) asserts `migrations/*theme*` contains no hex `DEFAULT` (see T7).

**(b) Headless Chrome screenshots, before and after.** Procedure, documented in `docs/features/theme-editor.mdx` (How to verify) and run in the final Verify step:

1. Before any WP-T code: local Postgres up (`pgctl.sh status|start`), `.env.local` host confirmed 127.0.0.1, dev DB seeded (`pnpm seed:demo ... --confirm` and `pnpm fixture:stats ... --confirm`), `pnpm dev -p 3601`.
2. For each URL in `/`, `/stats`, `/players/<slug of a fixture player>`, `/events`, at widths 1280 and 390, run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --virtual-time-budget=8000 --window-size=<w>,2600 --screenshot=<scratchpad>/theme-parity/before/<name>-<w>.png http://127.0.0.1:3601<path>`. `/fixtures` is excluded (live PlayHQ).
3. After WP-T: same DB, same command, `after/`.
4. Compare with a small script `scripts/shot-diff.mjs` built on `sharp` (already a dependency): decode both PNGs to raw RGBA buffers and count pixels whose channel difference exceeds a threshold (no `pixelmatch`, no ImageMagick, neither is guaranteed). Pass rule: at most 0.05 percent of pixels differ, and any diff is reviewed by eye (expected sources are time-dependent text such as "in 3 days"). Because relative dates can differ between runs, freeze with a fixed `Date` via the same dev session or accept and review those regions.
5. The stat card PNG is compared by eye only (the delta in T3).

**(c) Grep guard.** `tests/no-brand-hex.test.ts` walks `app/`, `components/`, `lib/`, `payload/components/`, `payload/globals/`, `config/`, `tailwind.config.ts` and the OG routes. It strips `/* */` comments first, then fails on (1) any of the 12 seed hex values, case-insensitive, in any file except `payload/seed/theme-defaults.ts`; (2) the channel literals `11 11 13` or `11,11,13` (the `rgba(11,11,13` and `rgb(11 11 13 /` tints) and the other eleven triples; (3) any other six- or eight-digit hex literal not in a small allowlist (`#ffffff`, `#000000`, with optional alpha; used for the named neutral constants in `lib/theme/og.tsx`). Three-digit `#fff` and `#000` stay legal (print CSS, mask image). The allowed-file list is one constant in the test, with a comment.

Other unit tests: `theme-contrast.test.ts` (known ratios: black on white 21, the seed pairs), `theme-resolve.test.ts` (invalid stored hex falls back to seed; saved values override; channel triples; `themeCss` contains no `<`, `;` outside declarations or quotes; crest chain order), `theme-tailwind.test.ts` (every `brand` colour equals `rgb(var(--brand-<key>) / <alpha-value>)` and keys equal `BRAND_KEYS`), `theme-fonts.test.ts` (every file in the manifest exists, `.ttf` starts with `00 01 00 00` or `OTTO` and is not a variable font (no `fvar` table), each licence file exists, total size under a budget of 2 MB, default font is in the menu), `theme-global.test.ts` (sanitized config: slug, `admin.group false`, update only for admins, hidden for editors, the `beforeValidate` hook rejects a failing pair, a client-neutral `defaultValue` is a function), `club-env.test.ts` (`assertClubEnv` throws in production when an env var is unset, passes elsewhere).

Integration (`tests/int/theme.int.test.ts`, local DB): saving a palette through the Local API is reflected by `getTheme()` after cache bust; an invalid hex and a failing contrast pair are rejected (hook-thrown `ValidationError`); an editor cannot update the global over REST (`overrideAccess: false`); `seedThemeGlobal` is skip-if-saved and `force` overwrites; the card route (extend `player-card-route.int.test.ts`) returns a PNG while an accent override is saved and while no theme row exists.

### T6. Files

New: `payload/globals/Theme.ts`, `payload/seed/theme-defaults.ts`, `payload/seed/seed-theme-global.ts`, `lib/theme/{tokens,contrast,resolve,css,fonts,font-faces,fonts-server,og}.ts(x)`, `lib/theme.ts` (server `getTheme()`, `cache` plus defaults fallback), `components/theme-style.tsx`, `payload/components/ThemeContrast.tsx`, `assets/fonts/**`, `scripts/shot-diff.mjs`, `instrumentation.ts` (`assertClubEnv`), `.env.example` entries, the tests above.

Edited: `config/brand.ts`, `config/site.ts` (env-driven constants, `BRANDING`, production assertion), `tailwind.config.ts`, `app/(frontend)/globals.css`, `app/(frontend)/shell.tsx`, `app/(payload)/layout.tsx`, `payload/components/admin.css`, `payload/components/Logo.tsx`, `components/events/event-placeholder-art.tsx`, `app/api/public/players/[slug]/card/route.tsx`, nav, footer and JSON-LD consumers of the crest (read `theme.crest`), `next.config.ts` (tracing includes, redirect default per item 14), `payload.config.ts` (register global, favicon constant), `payload/admin/navigation.ts`, `payload/scripts/seed-club.ts`, `payload/scripts/seed-demo.ts`, `payload/scripts/etl-legacy.ts` club step (also seeds theme), `docs/superpowers/plans/2026-10-03-payload-cutover-checklist.md` (blocker lines), the inventory items 10 to 13, 20, 23, `CLAUDE.md` (one line: club values come from config and the theme global, never hex in code; the guard test enforces it).

### T7. Access, migration, docs, seed

- Access: see T2. Nothing public-writable. The hex fields are validated server-side (not just in the form).
- Migration `theme_global`: creates the `payload.theme` table (palette and shades columns, `crest_id` FK to `media`, `heading_font` enum). **Field `defaultValue`s are functions** (`defaultValue: () => THEME_DEFAULTS.palette.accent`), which Payload does not write as SQL `DEFAULT`, so the migration stays club-neutral (the earlier `wp3_events` migration shows what happens with literal defaults); `resolveTheme()` and `seedThemeGlobal` supply the Lang Lang values. Review the generated SQL for schema qualification and for any hex `DEFAULT` (a test greps for it).
- Zero-touch deploy: with no saved row, `resolveTheme()` returns the seed, so production renders identically before anyone seeds. `seedThemeGlobal` (called by `seed:club`, `seed:demo`, the ETL club step) writes the seed only if never saved.
- Docs: new `docs/features/theme-editor.mdx` (persona: a club's designer or developer-admin; How to use: Advanced, Site look, pick five colours and the other seven shades, read the contrast list, upload a transparent PNG crest, choose a display font, Save; the site updates within seconds; how to verify with screenshots). Update `stat-cards.mdx` (colours and font from the theme, remove the "colours cannot be changed" line), `multi-club-template.mdx` (new steps, env list including the production-required three and `EXPORT_FILENAME_PREFIX`), `club-and-site-settings.mdx` (crest moved to the theme, logo is a fallback), `DESIGN.md` section 13 (status becomes as-built), README "Template notes". Add the index row.
- seed:demo: seeds the theme (idempotent); an optional `--theme-sample blue` flag writes a blue palette locally for eyeballing a second club look (never the default).

### T8. Acceptance (run locally)

```
pnpm vitest run tests/theme-seed.test.ts tests/theme-contrast.test.ts tests/theme-resolve.test.ts tests/theme-tailwind.test.ts tests/theme-fonts.test.ts tests/theme-global.test.ts tests/club-env.test.ts tests/no-brand-hex.test.ts tests/feature-docs.test.ts tests/admin-visibility.test.ts
pnpm vitest run tests/int/theme.int.test.ts tests/int/player-card-route.int.test.ts   # sequential, local DB
pnpm payload migrate:create theme_global && pnpm generate && git add payload-types.ts "app/(payload)/admin/importMap.js" && pnpm check:generated && pnpm check:migrations
pnpm tsc --noEmit
```

Manual: change the accent to blue in Advanced, Site look, Save, reload `/` and `/admin`; the public buttons, focus ring, selection, placeholder art and the admin primary buttons all change; set it back and the screenshot diff is clean.

### T9. Risks

- Missing the 900-class retrofit: not needed, classes are unchanged; the guard test stops regressions.
- `<alpha-value>` and gradient stops: verify `bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light` (the 4 px rule) in the screenshots.
- Font swap shifts text by a pixel or two: covered by T5b; fallback is to keep `next/font/google` for the default face only and use bundled files for the other four plus OG.
- `preload` on `next/font/local` is static, so a club that picks a non-default face still preloads the default face once (a small unused-preload cost); acceptable, revisit if it shows in Lighthouse.
- No draft preview of a theme before saving: a bad but valid palette goes live immediately. Mitigation: contrast validation, admin-only, and the seed "reset" instructions in the doc.
- The admin layout file is regenerated by Payload tooling only on `create-payload-app`, which is not used here.
- Duplicate crest fields (`theme.crest` and `club.logo`) could confuse: the Club details helper text points to the theme.

---

## 2. WP-M Per-match data store (issue #2)

### M1. What PlayHQ returns (investigated from `lib/playhq/*`, `tests/fixtures/playhq/*.json`)

Sources: `GET /v2/games/{id}/summary` (`RawGameSummary`, fixtures `game-summary-one-day.json` Clyde one-day, `game-summary-two-day.json` Nar Nar Goon v Lang Lang two-day) and the team fixture list (`RawFixtureGame`, `team-fixture-*.json`).

Per game (summary): `id`, `gradeId`/`grade`, `organisation`, `round` (name, abbreviation, `isFinalRound`), `status`, `type` (`oneDay`, `twoDay`), `schedule[]` (`day`, `dateTime` UTC ISO, `playingSurfaceId`; two-day games have two entries), `teams[]` (id, name, `isHomeTeam`, `outcome`, `organisation { id, name }`), `coinToss { winningTeamId, preference BAT|BOWL }`, `playingSurfaces[]` (name, abbreviated name, latitude, longitude, `venue { id, name, timezone }`), `appearances[]` and `periods[]`. The fixture list adds `updatedAt`, `venue.address.suburb`, `competitors[].scoreTotal`; `mapGame` currently drops `updatedAt` (W1 keeps it, see M5).

Per appearance (`appearances[]`): `id` (per game), `firstName`, `lastName`, `captainRole`, `playerNumber`, `isFillIn`, `isRegisteredPlayer`, `visible`, `roleType` (`Player` or `Coach`), `teamId`, `playerPosition`. No PlayHQ player id is exposed (identity is the name key, see M3).

Per innings (`periods[]`): `name` (`FIRST_INNINGS`, `SECOND_INNINGS`), `sequenceNo`, `teams[]` with `discipline` BATTING or BOWLING, and period team `status` (`DECLARED`, `ALL_OUT`, `END_OF_GAME` or null).

- Batting side statistics: `TOTAL_SCORE`, `TOTAL_OUTS`, `TOTAL_OVERS`, `TOTAL_EXTRAS`, `EXTRA_WIDES`, `EXTRA_NO_BALLS`, `EXTRA_BYES`, `EXTRA_LEG_BYES`, `EXTRA_PENALTY_RUNS`, `OVER_LIMIT`, `TOTALS`.
- Batting appearances: `displayOrder` (batting position proxy), `status` (`OUT`, `NOT_OUT`, `DID_NOT_BAT`, or null), statistics `TOTAL_RUNS`, `BALLS_FACED`, `FOURS`, `SIXES`, `STRIKE_RATE`.
- Bowling appearances (the bowling side's list, which also carries fielders who did not bowl): `OVERS` (cricket notation: 4.3 means 27 balls), `MAIDENS`, `RUNS`, `WICKETS`, `WIDES`, `NO_BALLS`, `ECONOMY`, and fielding statistics `CATCHES_AS_FIELDER`, `CATCHES_AS_WICKET_KEEPER`, `TOTAL_CATCHES`, `STUMPINGS`, `RUN_OUTS_ASSISTED`, `RUN_OUTS_UNASSISTED`, `TOTAL_RUN_OUTS`. `mapScorecard` currently drops non-bowlers (`OVERS > 0` filter), so fielding-only appearances are not used today.
- `fallOfWickets[]` on the batting side: `{ sequenceNo, appearanceId, runs }`. **Present in some innings and null in others** (in `game-summary-one-day.json` the first innings has none, the second has it; in the two-day fixture innings 1 and 2 have it, innings 3 and 4 do not).
- `sharedStatistics[]`: one entry per dismissal, `{ type, appearances: [{ id, role BATTING|BOWLING|FIELDING }] }`. Types seen in fixtures: `BOWLED`, `CAUGHT`, `LEG_BEFORE_WICKET`. The mapper also handles `STUMPED`, `RUN_OUT`, `HIT_WICKET`, `RETIRED_HURT`, `RETIRED`, `RETIRED_OUT`, but **those are not in any fixture**; the new fixture generator (M9) covers them, real-data behaviour for them is unverified.
- Quirks: PlayHQ returns a placeholder second innings for two-day games that never reached it (0 overs, 0 runs, two openers "not out 0"; `isInningsPlayed` detects it); a two-day game's `periods` have four entries with the third and fourth often empty; `appearances` includes coaches.

**Derivable (with the caveats below):** per-player batting and bowling lines per innings; position (`displayOrder`); how out, bowler, fielder per dismissal; extras split; innings totals, wickets, overs; declared and all-out flags; fall-of-wicket score and order **where `fallOfWickets` exists**; games played (appearance count); catches from dismissal events, stumpings and run-outs where the scorer entered them; toss and bat or field choice; result and margin type from `outcome` strings (`WON`, `LOST`, `WON_ON_FIRST_INNINGS`, `DRAW`, `TIE`, `NO_RESULT`, `ABANDONED`, `WON_BY_FORFEIT`, `LOST_BY_FORFEIT`); venue, grade, round, date and local date (venue timezone, default `CLUB_TIMEZONE`); opponent club (`organisation.id` is stable, unlike team names); captain, fill-in and registered flags.

**Caveats (verified in the fixtures).**

- In `game-summary-one-day.json`, innings 2's bowling list (the other team) has every appearance with `statistics: []` and `displayOrder: 0`: that team has no bowling or fielding data at all, while its CAUGHT and BOWLED dismissal events still exist.
- Batting rows in that fixture carry only `TOTAL_RUNS`: no `BALLS_FACED`, `FOURS`, `SIXES` or `STRIKE_RATE`.
- Therefore `balls`, `fours`, `sixes` are **nullable** (null means not recorded, never 0), and `match-innings` has `hasBowlingData` and `hasBallData` flags. Aggregates and any W2 rate treat null as absent, not zero.
- Fielding rows are only as complete as the scorer's entry; catches are derived from dismissal events (M3), never trusted from fielding statistics alone.
- The real shapes of forfeit, abandoned, `RUN_OUT`, `STUMPED` and `RETIRED_*` are unverified (M9 pre-build capture).

**Partnerships: deferred to W2.** Fall-of-wickets is complete for some innings (two-day fixture innings 1 and 2; one-day innings 1 has none and is "unavailable"), and partnership run values are exact team-score differences, but pair identity is inferred and `confidence: 'exact'` would be unearned. W1 stores `fowWicket` and `fowRuns` only and builds no `partnerships.ts`. When W2 derives them it must validate that the set of `fallOfWickets[].appearanceId` equals the OUT batters that have a dismissal event, and note that an all-out innings has no unbroken last pair.

**Not available from PlayHQ:** ball-by-ball, over-by-over scores, phases (powerplay, death overs), dot balls, per-batter minutes, partnership contributions per batter, wagon wheels, bowler-by-over spells, who was on strike at a wicket, DRS or umpire data, ground conditions. Features that need these (phase analysis, ball-by-ball charts) cannot be built from this source and W2 must not promise them.

### M2. Schema: a `match-*` family of six collections

All keyed by the PlayHQ game id (`gameId`), written only by sync, the backfill script and the seed (never by staff), with writes through `payload.db.drizzle` inside one transaction per game (same pattern as `lib/players/sync.ts`, so collection hooks do not run and revalidation is explicit). Table helpers live in `lib/match-store/db.ts` (`matchTables(payload)` and `MATCH_COLUMN_KEYS`, asserted by an int test exactly like `PLAYER_COLUMN_KEYS`). **Identity lives only on `match-appearances`**; the four child tables join to it by `(match, appearanceId)`.

1. **`matches`** (one row per game): `gameId` (unique), `status`, `type`, `seasonName`, `seasonStartYear` (stable integer from the season's `startsAt`; the "newest season first" order is derived at read time, never stored, because `collectSeniorAggregates`' newest-group-is-0 value moves every season), `competitionName`, `gradeId`, `gradeName`, `roundName`, `roundAbbr`, `isFinalRound`, `startsAt` (timestamptz, first `schedule[].dateTime`), `localDate` (text `YYYY-MM-DD`, via venue timezone), `days` (1 or 2), `venueName`, `venueSuburb`, `clubTeamId`, `clubTeamName`, `opponentTeamId`, `opponentName` (team), `opponentOrgId`, `opponentOrgName`, `isHome`, `tossWinnerTeamId`, `tossChoice` (`bat`, `bowl`, null), `clubWonToss` (bool, null if no toss), `clubOutcome` and `opponentOutcome` (raw strings), `result` (normalised enum `won|lost|draw|tie|no_result|abandoned`), `byForfeit`, `onFirstInnings`, `playhqUpdatedAt`, `sourceHash`, `syncedAt`. Senior games only in W1 (M5 explains). **Club versus club games** (both teams belong to the club's `clubIds`; `getTeamGames` can return them) are **skipped** in W1: `mapMatchBundle` returns null with reason `club_vs_club`, they count in `matchesSkipped`, and the reconciliation excludes the same games from the season-row side. One row per club team would break `gameId` uniqueness; revisit when a club asks.
2. **`match-innings`**: `match` (relationship), `sequenceNo`, `periodName`, `battingTeamId`, `bowlingTeamId`, `isClubBatting`, `periodStatus`, `played` (computed with exactly the existing `isInningsPlayed`; false for the placeholder innings), `declared`, `allOut`, `totalRuns`, `totalWickets`, `totalBalls` (overs converted with `oversToBalls`, avoids the 4.3 notation trap), `extrasTotal`, `wides`, `noBalls`, `byes`, `legByes`, `penalty`, `hasFallOfWickets`, `hasBowlingData`, `hasBallData`. Unique `(match, sequenceNo)`. `mapMatchBundle` tolerates missing disciplines and empty `periods` (an abandoned game may have no BATTING or BOWLING team in a period): it emits what exists and never throws.
3. **`match-appearances`** (the only table that holds identity): `match`, `appearanceId`, `teamId`, `isClubSide`, `player` (club side only, nullable relationship to `players`), `nameKey` (club side only), `displayName` (opposition only; club side is resolved from `player` at read time), `captainRole`, `isFillIn`, `isRegisteredPlayer`, `playerNumber`. Unique `(match, appearanceId)`. Players only (`roleType === 'Player'` and `visible === true`, same fail-closed rule as `mapScorecard`).
4. **`match-batting`**: `innings`, `match`, `appearanceId`, `position` (`displayOrder`), `battingStatus` (`out|not_out|did_not_bat|unknown`), `runs`, `balls` (nullable), `fours` (nullable), `sixes` (nullable), `dismissalType` (enum, null when not out), `bowlerAppearanceId`, `fielderAppearanceId` (for a run-out with two fielders only the first FIELDING role is stored, as `dismissalText` does today; documented, no second column), `fowWicket`, `fowRuns` (joined from `fallOfWickets[].appearanceId`). No identity columns, no `bowlerPlayer`, `fielderPlayer`, `bowlerName` or `fielderName`: the names resolve at read time through `bowlerAppearanceId` and `fielderAppearanceId` joined to `match-appearances`. Unique `(innings, appearanceId)`.
5. **`match-bowling`**: `innings`, `match`, `appearanceId`, `order` (`displayOrder`), `balls` (from `OVERS`), `maidens`, `runs`, `wickets`, `wides`, `noBalls`. Rows only for `OVERS > 0` (same filter as `mapScorecard`). Unique `(innings, appearanceId)`.
6. **`match-fielding`**: `innings` (the innings in which this player fielded), `match`, `appearanceId`, `catches`, `keeperCatches`, `stumpings`, `runOutsAssisted`, `runOutsUnassisted`. Unique `(innings, appearanceId)`. Rows only for appearances PlayHQ lists with at least one fielding statistic; informational (see caveats).

Design choices:

- **No raw JSON is stored** (it would be about 50-100 KB per game). Traceability is `gameId` plus `sourceHash` (a hash of the mapped rows) plus `playhqUpdatedAt`. A bad mapper can be fixed and re-run because PlayHQ keeps the games.
- **Identity.** The durable club-side identity is `nameKey` on `match-appearances` (the same `first|last` lower-case key as `player-aliases`), and `player` is a cached resolution through `player_aliases`. Because identity exists in one table, a player merge is **one** `UPDATE match_appearances SET player = target WHERE player = source` and aliases already map both name keys to the target; the "hidden club player" rule and the relink pass (`relinkMatchPlayers`, run after the alias heal step of every sync) each touch one table. If a player is deleted, `player` becomes null (`ON DELETE SET NULL`) and relink restores it from `nameKey` through the aliases. Bowler and fielder links in dismissals survive both events, since they reference appearances.
- **Opposition people** are stored as display-name text on `match-appearances.displayName` (formatted by the existing `displayName()` policy). That data is already public on `/fixtures/[gameId]` one live game at a time. Club-side people are never stored as text (resolved from `player` at read time). That is how a hidden club player is kept out of match views, including inside a dismissal ("c X b Y"): the read helper suppresses a hidden player's name (shows "a club player").
- **Children are replaced wholesale per game, in one transaction, when `sourceHash` changed.** Upsert key: `matches.gameId` (`INSERT ... ON CONFLICT (game_id) DO UPDATE`), then `DELETE` and `INSERT` of that match's children. Unique indexes make a duplicate impossible. Consumers must therefore never store child row ids; reference `matches.id` or `gameId`.
- **No `isJunior` flag in W1.** The players pipeline is senior-only (`collectSeniorAggregates`) and juniors are shown with abbreviated names. W1 stores senior games only. A later wave that wants junior games adds an `isJunior` column and a hard rule that no public query reads those rows; do not store junior names before that rule exists.

### M3. Relationship to the existing aggregates

`player-seasons` stays the materialised aggregate and the read path of every stats page in W1 (shape unchanged). It is already fully rewritten (delete plus insert) on every sync from the same PlayHQ data, so nothing in it is non-derivable. Decision: **keep it as the aggregate source in W1; the sync writes match rows alongside and checks reconciliation; switching stats to "derived from match rows" is a W2 decision** taken once the nightly mismatch count has been zero for a period. This keeps W1 risk-free for the leaderboards.

Reconciliation rules. The compare is per **(resolved player, `teamId`)**, i.e. **after alias resolution**: `buildSyncPlan` merges name keys through aliases with `combineCounts`, so a player with two aliases has one season row, and the derived side merges the same way (summed counts, merged high score and best figures). `upsertMatchBundle` therefore receives an alias map read **after** the new-player insert of the same sync, not the pre-plan map. The pure `aggregateFromMatchRows(rows)` lives in `lib/match-store/aggregate.ts`; it must reuse `isInningsPlayed`, `oversToBalls` and the `aggregatePlayers` tie rules rather than copy them.

| Season field | Derived from match rows | Exact? |
| --- | --- | --- |
| `games` | count of `match-appearances` for that player and club team in FINAL matches | exact |
| `batInnings`, `batNotOuts` | `match-batting` rows in played innings, mapped exactly as `mapScorecard`: every non-DNB row counts as an innings, including `unknown`; a row with null status **and** no statistics is `did_not_bat` (the two-day fixture innings 2 has one), a null-status row with statistics is an innings (`unknown`). Not-outs = `not_out`. The `played` flag is `isInningsPlayed`, unchanged | exact |
| `batRuns`, `batBalls`, `batFours`, `batSixes` | sums | exact |
| `batHighScore`, `batHighScoreNotOut` | maximum runs, tie goes to the not-out score (same rule as `aggregatePlayers`) | exact |
| `bowlBalls`, `bowlMaidens`, `bowlRuns`, `bowlWickets` | sums over `match-bowling` | exact |
| `bowlBestWickets`, `bowlBestRuns` | most wickets, fewer runs breaking ties | exact |
| `catches` | count of `CAUGHT` dismissal events whose fielder appearance resolves to the player, plus caught-and-bowled for the bowler. The current aggregate keys by display name within a game, so two same-name club players mix. Rule: compare `catches` only for player-seasons where every club display name is unique within each of its games; other player-seasons are excluded from the catches check and counted in `catchesSkippedSameName` (no permanent nightly mismatch). A fixture asserts equality where names are unique | exact where compared |

Informational only (not reconciled, because `player-seasons` does not have them): `keeperCatches`, stumpings, run-outs. Also reported, not asserted: `CATCHES_AS_FIELDER` plus `CATCHES_AS_WICKET_KEEPER` versus `TOTAL_CATCHES` per appearance.

Allowed difference: zero for every integer field. PlayHQ's own rounding (strike rate, economy, average) is never stored in the match tables, only integer counts, so there is no tolerance to define; rates are computed from the counts.

### M4. Sync, nightly and operator backfill

**Pure mapping (stays in `lib/playhq`, no DB).** New `lib/playhq/match-rows.ts`: `mapMatchBundle(raw: RawGameSummary, ctx: { clubOrgId, clubIds, seasonName, seasonStartYear, competitionName, fixture: Game }) => MatchBundle | { skip: reason }` returns plain rows (no ids) for the six tables and `sourceHash` (sha1 of a stable stringify of the rows). Skips (never throws) when no club side is found, when the game is not FINAL, for junior games and for club versus club games. `lib/playhq/types.ts` gains `updatedAt` on `Game` (`mapGame` already receives it in `RawFixtureGame`) so existing tests are extended, not broken.

**Writes.** `lib/match-store/write.ts`: `upsertMatchBundle(payload, bundle, aliasMap)` (one transaction; skip when the stored `sourceHash` equals); `relinkMatchPlayers(payload)`; `matchStoreStats(payload)`.

**Nightly sync (`lib/players/sync.ts`, cron route unchanged).** `collectSeniorAggregates` is refactored into `collectSeniorData()` returning the aggregates and, from the **same** scorecard fetches, the raw summaries mapped to bundles (one PlayHQ call per game). To get the raw summary, `getGameSummary` gets a sibling `getRawGameSummary(gameId, opts?: { fresh })`; `getGameSummary` calls it and maps. **Stale-cache rule:** `getRawGameSummary` reuses `phqFetch` with the seven-day `TTL.gameFinal` revalidate, so a corrected scorecard would hash the same. When a fixture's `updatedAt` differs from the stored `matches.playhqUpdatedAt` (or no stored row exists), the summary is fetched with `cache: 'no-store'` and the `playhq-game` tag is revalidated; the same fresh raw object feeds both the season aggregates and the bundle, so they cannot disagree. The backfill applies the same rule. New step after the existing "replace season rows" transaction and before "mark the run": `writeMatchStore(...)` in its **own** try/catch, so a match-store failure never fails the player sync (the season data is already committed). There is **no per-run cap**: the expensive part is the per-game PlayHQ fetch loop (`mapLimit(5)`), which a write cap would not limit, and the DB upserts are cheap; the first nightly run after deploy is bounded by the fetch loop that exists today (and the operator backfill, which is sequential and rate-limited, is the way to load history). Consequently there is no `MATCH_SYNC_MAX_PER_RUN` and no `matchIncomplete` counter. After the writes it runs the nightly reconciliation, which compares the **stored** match rows (read back with `aggregateFromMatchRows`) against the season rows the sync just planned, per (resolved player, team, season), excluding skipped games on both sides and skipping any pair containing a game whose write failed (that game counts in `matchError`). The in-memory comparison of two mappings of the same raw data is the unit test in M9. Counters on the run row (new columns on `player-sync-runs`): `matchesUpserted`, `matchesSkipped`, `matchMismatches`, `matchError`. The first N mismatches are logged (`console.error('[matches] reconcile', ...)`). `PlayerSyncPanel.tsx` shows the counters.

**Operator backfill: `payload/scripts/backfill-matches.ts`** (`pnpm backfill:matches`), same guard as the other operator scripts (`payload/scripts/_guard.ts`):

- Default is a **dry run** (read-only; `guard({ write: false })`): it reads the seasons, teams and team fixtures from PlayHQ (a handful of GETs, no per-game summary calls), compares each FINAL game's fixture `updatedAt` with `matches.playhqUpdatedAt` in the local DB, and prints per season and team how many games would be fetched, the number of requests and the estimated time at the chosen delay.
- `--apply --confirm` writes. `--target <host>/<db>` must equal `DATABASE_URI` (the guard refuses otherwise; remote hosts additionally need `ALLOW_REMOTE_DB=yes`, as for every script). `--apply` without `--confirm` is refused by the guard.
- Sequential: no parallelism (`mapLimit(..., 1)` semantics) with `--delay-ms` between every PlayHQ request (default 1500, minimum 500, enforced). A 429 or 5xx stops the run with a clear message (resume is cheap) rather than retrying in a loop. The key is the club's live key.
- Resumable: the database is the checkpoint. A game whose stored `playhqUpdatedAt` equals the fixture's and whose `sourceHash` matches is skipped without a summary call; re-running after an interruption continues where it stopped.
- Selection: `--season "2025/26"` (repeatable), `--since YYYY-MM-DD` (local game date), `--limit N` (games per invocation), `--team <id>`.
- Logging: writes `./backfill-matches-<timestamp>.log` (path overridable with `--log`; the pattern `backfill-matches-*.log` is added to `.gitignore`) with one line per request and per game (gameId, action created, updated, skipped, error), plus a final summary and reconciliation counts.
- Pure, unit-tested helpers: `parseBackfillArgs(argv)`, `planBackfill(fixtures, stored, opts)`.

### M5. Access

All six collections: `admin.group: false`, `admin.hidden: true` and `access.create/update/delete: nobody` (the sync and script write through drizzle). They are **not** added to the committee nav and there is no "Matches (data)" `advancedNav` entry. `navigation.ts` gets `internalCollections` (slugs written only by code with no admin UI), and `tests/admin-visibility.test.ts` is adjusted: every collection must be in `everydayNav`, `advancedNav` or `internalCollections`, and an internal collection must have `admin.hidden === true` and `nobody` write access. (`admin.hidden: true` also hides them from admins; admins inspect counters in the `player-sync-runs` panel, and developers use psql.)

**Read access: `isStaff` on all six collections.** The child tables would let anonymous clients enumerate every opposition player's full name for every senior game at `/api/match-batting?limit=...`, and a `where` on `player.hidden` can leak the hidden state, while the existing public pages show one live game at a time. Public pages read through the Local API helpers in `lib/match-store/queries.ts`, which state their own filters (FINAL only; club-side rows require a resolved, non-hidden player; hidden players' names suppressed). No field-level access or `afterRead` strippers are needed. No private data is stored: no emails, phones, dates of birth, addresses. Juniors are not stored (M2).
- **Every public query helper restates its own filter** (the Local API ignores access rules, CLAUDE.md rule): FINAL only, hidden players suppressed, `isClubSide` rows require a resolved non-hidden player.

### M6. Performance: indexes for the W2 queries

| W2 query | Index |
| --- | --- |
| By player (innings list, form, vs opposition) | `match-appearances (player, match)` (the only table with `player`); children join by `(match, appearanceId)` |
| By opponent (head-to-head, vs a club) | `matches (opponentOrgId, startsAt)` |
| By season and grade | `matches (seasonStartYear, gradeId)`, `matches (clubTeamId, startsAt)` |
| Latest and by date | `matches (startsAt)`, `matches (status, startsAt)` (plain compound indexes: Payload's `indexes` option takes fields and `unique`, not sort order, and Postgres scans a btree backwards, so no `desc` and no hand-edited migration) |
| By match (scorecard) | `match-innings (match, sequenceNo)` unique; each child table `(match)` plus its unique innings key; `match-appearances (match, appearanceId)` unique |
| Idempotent lookup | `matches (gameId)` unique |

Row volume estimate: roughly 20 players x 40 games a season is 800 batting rows a season per team, so tens of thousands of rows in total; Postgres handles this with these indexes. Slim cached payloads follow the existing `unstable_cache` pattern in `lib/stats/queries.ts` (per season keys, tag `match-store`), and the sync revalidates that tag.

### M7. Files

New: `payload/collections/{Matches,MatchInnings,MatchAppearances,MatchBatting,MatchBowling,MatchFielding}.ts`, `lib/playhq/match-rows.ts`, `lib/match-store/{db,write,aggregate,names,queries}.ts`, `payload/scripts/backfill-matches.ts`, `payload/scripts/fixtures/match-seed-data.ts`, `payload/scripts/fixtures/match-seed-db.ts`, the migration, tests, `docs/features/match-data-store.mdx`.

Edited: `payload.config.ts` (register collections), `lib/playhq/types.ts` and `games.ts` (`updatedAt`), `lib/playhq/queries.ts` (`getRawGameSummary`), `lib/players/sync.ts`, `lib/players/db.ts` (merge repoints `match-appearances.player`, one UPDATE), `payload/endpoints/mergePlayers.ts`, `payload/collections/PlayerSyncRuns.ts` and `PlayerSyncPanel.tsx`, `payload/admin/navigation.ts`, `tests/admin-visibility.test.ts`, `package.json` (`backfill:matches`), `.gitignore`, `payload/scripts/seed-demo.ts`, `docs/features/fixtures-and-scorecards.mdx`, `docs/features/playhq-player-sync.mdx`, `docs/features/index.mdx`.

### M8. Migration plan

One migration `match_store`: creates the six tables with their unique and plain indexes, `ALTER TABLE payload.player_sync_runs` adding the four counter columns, the `payload_locked_documents_rels` columns Payload generates for new collections. Review the SQL for schema qualification and index names. Rollback is safe: all tables are derived data, rebuilt by sync or backfill.

### M9. Tests, fixtures, seed

- Unit, `tests/playhq/match-rows.test.ts`: both real fixtures map to bundles; dismissal types including the unfixtured ones (via synthetic raw objects and the captured real shapes below); `fallOfWickets` joined to batting rows; null `fallOfWickets` gives `hasFallOfWickets = false`; the one-day innings 2 with empty statistics gives `hasBowlingData = false`, `hasBallData = false` and null `balls`, `fours`, `sixes`; placeholder second innings gives `played = false`; DNB rows (including null status with no statistics); fielding rows for non-bowlers; invisible players and coaches dropped; junior and club-versus-club games skipped; missing disciplines and empty `periods` tolerated; run-out with two fielders stores the first; `sourceHash` stable across key order and changes when a run is changed.
- Unit, `tests/match-store-reconcile.test.ts`: for the two real fixtures plus every synthetic and captured match, `aggregateFromMatchRows(mapMatchBundle(raw))` deep-equals `aggregatePlayers([mapScorecard(raw)], teamId)` on all integer fields (table in M3), including a player with two aliases (compared after alias resolution, merged high score and best figures) and a same-name pair (catches excluded, counted in `catchesSkippedSameName`); also checks `sum(batting runs) + extras = totalRuns` for fully-listed innings (a warning list, because invisible players can legitimately make it differ).
- Unit: `backfill-args.test.ts`, `match-store-names.test.ts` (hidden suppression, "c & b", names resolved through appearance ids).
- Integration (local DB, run sequentially): `tests/int/match-store.int.test.ts`: upsert a bundle twice and the second call changes no row (compare `updatedAt` and the writes counter); an unresolved club row has null `player` and relinks from `nameKey` after an alias is added; merging two players repoints `match-appearances` with one UPDATE and dismissal names still resolve; deleting a player leaves appearances with null `player` and relink restores them; the unique keys reject duplicates; **anonymous REST read of all six collections is denied** (staff read works); `MATCH_COLUMN_KEYS` match the drizzle tables. `tests/int/match-sync.int.test.ts`: `syncPlayers` with the PlayHQ collection mocked writes match rows, records counters, a changed fixture `updatedAt` triggers a fresh (uncached) fetch and replaces the rows, a match-step failure still leaves `status: 'ok'` for the season sync with `matchError` set.
- **Seed fixture of about 25 matches** (synthesised): `payload/scripts/fixtures/match-seed-data.ts` is a deterministic generator (seeded PRNG) that emits about 25 `RawGameSummary`-shaped games over two seasons for 14 invented club players and invented opponents, so it exercises the real mapper and no real person's name is added. It includes the edge cases: declared innings, all out, two-day with a placeholder second innings, DNB, run-out, stumped, retired hurt, caught-and-bowled, a forfeit, an abandoned game, an innings with null `fallOfWickets`, an innings with no bowling data, a fill-in, a hidden club player, a player with two aliases. **Because the generator is written from the same assumptions as the mapper, it cannot catch a wrong shape.** So, as the first WP-M step, capture **at most 5** real read-only game summaries chosen to cover the unverified shapes (a forfeit, an abandoned game, a game with `RUN_OUT`, `STUMPED` and `RETIRED_*`), using `PLAYHQ_*` from the worktree `.env.local`, sequential, at least 2 s apart, GET only, stopping on any 429 or 5xx. They are stored under `tests/fixtures/playhq/` with person names replaced by deterministic placeholders (names in the two existing fixtures are already there; no new real names are added) and run through the same unit tests. If no such game can be found cheaply, the backfill dry run and first apply log every unknown shape (`unknown_shape` with the game id) instead.
- seed:demo: new `seedDemoMatches(payload)` (idempotent, only when `matches` is empty) writes the generated games through `upsertMatchBundle`, creating the demo club players and aliases if they do not exist (using the same `fixture:stats` player names when present). W2 pages then have realistic data locally.
- Docs: `docs/features/match-data-store.mdx` (admin-facing: nothing to do; developer-facing what is stored, how to run the backfill, what is not derivable); update `fixtures-and-scorecards.mdx`, `playhq-player-sync.mdx`, index.

### M10. Acceptance (run locally)

```
pnpm vitest run tests/playhq/match-rows.test.ts tests/match-store-reconcile.test.ts tests/match-store-names.test.ts tests/backfill-args.test.ts tests/admin-visibility.test.ts tests/feature-docs.test.ts
pnpm vitest run tests/int/match-store.int.test.ts tests/int/match-sync.int.test.ts      # sequential
pnpm payload migrate:create match_store && pnpm generate && git add payload-types.ts "app/(payload)/admin/importMap.js" && pnpm check:generated && pnpm check:migrations
pnpm seed:demo --target 127.0.0.1/langlang_dev --confirm && psql ... "select count(*) from payload.matches"   # about 25
pnpm backfill:matches --target 127.0.0.1/langlang_dev                                  # dry run, no writes
pnpm backfill:matches --target 127.0.0.1/langlang_dev --apply --confirm --season "2025/26" --limit 3 --delay-ms 2000   # optional, three real games, read-only GETs
pnpm backfill:matches ... --apply --confirm          # run again: reports 0 created, N skipped (idempotent)
```

Acceptance statements from the issue: totals reconcile with `player-seasons` (reconcile test, zero mismatches), re-running writes nothing (int test and the backfill second run).

### M11. Risks

- Unfixtured dismissal types behave differently in real data. Mitigation: the mapper falls back to `dismissalType = 'other'` and the raw type name, never throws; the first backfill run logs unknown types.
- The first nightly run after deploy does more work: bounded by the existing per-game fetch loop; the DB writes are cheap (see M4).
- Name-key identity is weak (PlayHQ has no player id): two people with the same name merge, a changed spelling splits. Unchanged from today and handled by the existing alias and merge tools; `nameKey` on `match-appearances` makes any fix retroactive. Same-name pairs are excluded from the catches reconciliation (M3).
- A hidden club player's name can leak through opposition dismissal text if W2 renders stored names: avoided by storing club-side people as `player` references on `match-appearances` only and resolving at read time (M2, M5). Any W2 page must use `lib/match-store/names.ts`, and the collections are staff-read only.
- `players-sync` and match writes are not one transaction: acceptable because match data is derived and re-runnable; the counters make a failure visible.
- Raw JSON not stored: a PlayHQ retention change would stop re-derivation. Acceptable; the rows themselves are the archive.
- Delete-and-insert of children changes row ids: documented, consumers reference `match` and `gameId`.

---

## 3. WP-P Pages and news (issue #22)

### P1. Decisions

**Route for pages: `/info/[slug]`.** The discriminator is not the Next router (static routes already beat a top-level `[slug]`, so there is no hard collision) but two side effects of a top-level `[slug]`: every unknown URL (bots probing `/wp-login.php` and similar) would run a database lookup before `notFound()`, and the unmatched-URL path would stop reaching the static `global-not-found` the project relies on. `/info/[slug]` avoids both for the price of a slightly longer URL, and slugs under `/info` cannot collide with any top-level route, so there is **no reserved-slug list** (no `lib/reserved-slugs.ts`). A small validator allows lowercase letters, digits and single hyphens and rejects `index`. News is `/news` and `/news/[slug]`.

**Status model: custom `status` select (`draft`, `published`) plus `publishedAt`, not Payload drafts/versions.** This mirrors `stories` (simple admin, no `_v` tables, no autosave surprises). Staff-only preview is a separate route (below), so live preview is not needed.

**Where the nav comes from (no `navigation` global in W1).** The static links stay in `club-defaults.navigation`. Pages carry their own placement fields, so the committee ticks "Show in the menu", picks where and saves; `buildNavigation({ base, pages, hasNews })` merges the defaults with published pages. A `navigation` global (extra collection of array tables, seed, tests, admin entry, and a DB read on every shell render including `global-not-found`) is deferred; #22 only needs pages in the menu. The pages read is a small `unstable_cache` query tagged `nav-pages` (revalidated by the page hooks) with a try/catch fallback to the defaults, so the shell still renders without a database.

**Announcements, stories and news.** Announcements stay as they are: short-lived dismissible banners and a list. **Stories** (`/history`) are the club's long-lived narrative pieces, edited in a fixed place. **News** is distinct from both: dated, chronological club articles with a cover, shown in a feed, in the home strip and in the sitemap with `datePublished` for Article structured data. Folding News into Stories with a `kind` field was considered and rejected because stories have no date feed or scheduling and no listing semantic, and changing the stories model touches the history page and its migration for no W1 gain. The admin help text says which to use.

### P2. `pages` collection

`payload/collections/Pages.ts`, slug `pages`, labels "Page" and "Pages".

- `title` (required, 200 chars), `slug` (unique, indexed, set from the title on create by the existing `uniqueSlug('pages')` hook, then stable; admin can edit it, committee cannot; the small validator above rejects bad characters and `index`).
- `status` select `draft|published` (default `draft`), `publishedAt` (date; set automatically the first time it is published; editable).
- `seoTitle` (60), `seoDescription` (160), `ogImage` upload (optional). Fall back to title and the first text block.
- Navigation: `showInNavigation` select `none|clubhouse|primary|footer` (default `clubhouse`), `navLabel` (optional short label, else the title), `navOrder` number (default 100).
- `content`: `blocks` field, at most 40 blocks, with **three** blocks in W1 (`gallery`, `documents`, `people` and `sponsors` each add a block table and a component and have no W1 consumer; they are deferred to W2 and the pinning test says "exactly three"):
  - `text`: `richText` (Lexical, a subset of `storyFeatures`: paragraph, headings h2 h3, bold, italic, links with href only, ordered and unordered lists, blockquote, horizontal rule).
  - `image`: `image` (upload to `media`, required), `alt` (required, helper text, defaults from the media alt), `caption`, `width` select (`narrow|wide|full`).
  - `cta`: `label`, `url` (http(s) or a site-relative path, validated with the existing `httpUrlOrEmpty` style helper), `style` select (`primary|outline`), `note`.

- Access: read `staffOr({ status: { equals: 'published' } })` (public REST sees published only); create, update, delete `isStaff` (the committee adds pages). `disableDuplicate: true`. `admin.useAsTitle: 'title'`, `defaultColumns: ['title','status','showInNavigation','updatedAt']`, `listSearchableFields`. Description in plain words.
- Hooks: `beforeChange` sets `publishedAt`; `afterChange` and `afterDelete` revalidate `/info/<slug>`, `/sitemap.xml`, the `nav-pages` cache tag and the root layout (`{ layout: true }`, because the menu changed).

### P3. `news` collection

`payload/collections/News.ts`, slug `news`, labels "News post" and "News".

- `title`, `slug` (as for pages, stable), `status`, `publishedAt` (required when published; default now; a future date schedules the post: public queries require `publishedAt <= now`, pages refresh within the five-minute revalidate of the listing, documented), `cover` upload (optional), `excerpt` (textarea, 280; if empty it is derived from the body for the listing and meta description), `body` richText (Lexical with the story feature set plus images via `UploadFeature`), `author` (text, optional; JSON-LD falls back to the club name), `seoTitle`, `seoDescription`.
- Access: read `staffOr({ and: [{ status: { equals: 'published' } }, { publishedAt: { less_than_equal: <now> } }] })` (evaluated per request), write `isStaff`.
- Hooks as for pages; revalidate `/news`, `/news/<slug>`, `/`, `/sitemap.xml`.

### P4. Public pages and components

- `app/(frontend)/info/[slug]/page.tsx`: `getPublishedPage(slug)` (explicit `status: published` filter), `notFound()` otherwise, `generateMetadata` with `canonicalFor`, `titleWithSuffix`, `truncateDescription` (existing helpers in `lib/site-metadata.ts`), JSON-LD `webPageJsonLd`. `revalidate = 300` plus on-demand revalidation. Renders `components/blocks/render-blocks.tsx` (text, image, cta).
- Rich text: one shared Lexical-to-HTML renderer. `lib/stories-convert.ts` already converts between Lexical and the sanitised HTML used for stories **(verify the exported name when implementing)**; if it has no standalone `lexicalToHtml`, extract one shared function and have stories, pages and news use it, styled with the existing `.story-content` rules. No new sanitiser.
- `app/(frontend)/news/page.tsx` (listing, 12 per page, cover, date, excerpt), `app/(frontend)/news/[slug]/page.tsx` (article, previous and next, `newsArticleJsonLd`, share meta).
- Home: `components/news-strip.tsx` shows the latest three published posts below the highlights, hidden when there are none (`listLatestNews(3)`), so a club with no news sees no empty section.
- Preview: `app/(frontend)/preview/[collection]/[id]/page.tsx`: `[collection]` is whitelisted to `pages` or `news` (anything else is `notFound()`) and `id` must match `^\d+$`; staff only (checks the session with `payload.auth({ headers })`, otherwise 404), `dynamic = 'force-dynamic'`, `noindex`, renders drafts with the same view components. `/preview` is also added to the `robots.ts` disallow list. The collection `admin.preview` points to it. Kept separate so the public routes stay statically cacheable.
- SEO: `app/sitemap.ts` adds `/news`, every published `/news/<slug>` and `/info/<slug>` with `lastModified = updatedAt`; `SEO_PAGES` in `club-defaults.ts` gains `news` (listing title and description), which adds columns to the `club` global (in the migration; the new `club` fields use function `defaultValue`s so no Lang Lang copy lands in a SQL `DEFAULT`, and the seed supplies the text). `lib/structured-data.ts` gains `newsArticleJsonLd` (headline, `datePublished`, `dateModified` never before `datePublished`, image, author, publisher = the club organisation with logo, `mainEntityOfPage`) and `webPageJsonLd`; the tests in `tests/sitemap.test.ts` and `tests/structured-data.test.ts` are extended.

### P5. Navigation

- No new global. `lib/navigation.ts` is a pure `buildNavigation({ base, pages, hasNews })` where `base` is `club-defaults.navigation` and `pages` are the published pages. `lib/navigation-queries.ts` (`getNavigation()`) reads the pages through the cached `nav-pages` query (see P1), per-request cached like `getClub`, with a DB-down fallback to `base`, because `FrontendShell` is also the static `global-not-found` shell and must render without a database.
- Rules: pages with `showInNavigation = 'primary'` are appended to the primary list ordered by `navOrder`, at most two (extras fall into the Clubhouse group, deterministic, so the desktop bar cannot overflow); `clubhouse` pages append to the Clubhouse group; `footer` pages append to footer column B. A News link is added to the Clubhouse group and the footer only when at least one published post exists (no dead link). Pages that are drafts never appear.
- `app/(frontend)/shell.tsx`, `components/site-nav.tsx`, `components/site-footer.tsx` take their link lists from `getNavigation()`; labels such as the funding credit stay on `club`.

### P6. Committee admin

- `navigation.ts`: `everydayNav` gains `{ key: 'pages', label: 'Pages', path: '/collections/pages' }` and `{ key: 'news', label: 'News', path: '/collections/news' }`. The cap in `tests/admin-visibility.test.ts` goes 14 to 16 with an inline comment ("Pages and News: committee-run content"). `jobTiles` gains "Add a page" ("An info page such as About or Join us", `/collections/pages/create`) and "Post news" ("A news article with a picture", `/collections/news/create`); the cap goes 10 to 12 with a comment. The menu is two items longer; hiding one behind Advanced was rejected because the committee must reach both (the News versus Stories distinction is justified in P1).
- `helpContent.ts`: two new sections ("Add a page", "Post news") with numbered steps, and a line in the announcements section explaining announcements versus news.
- Plain labels and helper text on every field (for example `showInNavigation`: "Where should a link to this page appear?").

### P7. Files

New: `payload/collections/{Pages,News}.ts`, `payload/fields/blocks.ts` (the three block configs), `payload/editor/pageLexical.ts`, `lib/pages-queries.ts`, `lib/news-queries.ts`, `lib/navigation.ts`, `lib/navigation-queries.ts`, `components/blocks/*` (text, image, cta), `components/news-strip.tsx`, the routes in P4, tests, `docs/features/pages.mdx`, `docs/features/news.mdx`.

Edited: `payload.config.ts`, `app/(frontend)/page.tsx`, `shell.tsx`, `site-nav.tsx`, `site-footer.tsx`, `app/sitemap.ts`, `app/robots.ts` (disallow `/preview`), `lib/structured-data.ts`, `lib/domain.ts` and `lib/payload/mappers.ts` (types), `payload/seed/club-defaults.ts` (`news` SEO key), `payload/globals/Club.ts` (page labels), `payload/admin/navigation.ts`, `payload/admin/helpContent.ts`, `tests/admin-visibility.test.ts`, `tests/sitemap.test.ts`, `tests/structured-data.test.ts`, `payload/scripts/seed-demo.ts`, `payload/scripts/seed-club.ts`, `docs/features/index.mdx`, `docs/features/announcements.mdx`, `docs/features/home-page.mdx`, `docs/features/seo.mdx`, `docs/features/committee-admin.mdx`.

### P8. Migration plan

One migration `pages_news`: tables for `pages` and its block tables (one per block type: text, image, cta), `news`, new `club` columns for the `news` SEO group, and the `payload_locked_documents_rels` columns for the two collections. Review for schema qualification and for literal `DEFAULT`s carrying club copy.

### P9. Tests

- Unit: `slug-validator.test.ts` (characters, `index` rejected), `navigation.test.ts` (primary cap of two, ordering by `navOrder`, drafts excluded, News link only with posts, no pages gives exactly today's `club-defaults.navigation`, DB-down fallback), `pages-queries.test.ts` and `news-queries.test.ts` (filters stated: published only, `publishedAt <= now`), `blocks-config.test.ts` (exactly the three blocks, `maxRows` 40, the CTA url validator), `structured-data.test.ts` additions, `sitemap.test.ts` additions (and `/preview` in robots disallow), feature-docs and admin-visibility.
- Integration (`tests/int/pages.int.test.ts`, `news.int.test.ts`): anonymous REST returns published only (a draft by id is 404 or empty); an editor can create, update and delete; a scheduled news post is invisible until its time; slug uniqueness and stability (a title edit does not change the slug); a bad slug is rejected; creating a page with `showInNavigation = 'clubhouse'` makes `getNavigation()` include it, and unpublishing removes it.
- Route tests: `tests/info-page-route.test.ts` (unknown slug gives not-found, draft gives not-found, published renders), preview route requires a session, rejects a collection other than `pages` or `news` and a non-numeric id.

### P10. seed:demo additions

Pages: "About the club" (text, image), "Join the club" (text, CTA to `/contact`), "Ground and directions" (text, footer placement), one draft page "Draft: season plan". News: four published posts with covers from `public/assets/gallery` (bodies through `htmlToLexical`), one draft, one scheduled for a future date.

### P11. Acceptance (run locally)

```
pnpm vitest run tests/slug-validator.test.ts tests/navigation.test.ts tests/pages-queries.test.ts tests/news-queries.test.ts tests/blocks-config.test.ts tests/structured-data.test.ts tests/sitemap.test.ts tests/admin-visibility.test.ts tests/feature-docs.test.ts
pnpm vitest run tests/int/pages.int.test.ts tests/int/news.int.test.ts        # sequential
pnpm payload migrate:create pages_news && pnpm generate && git add payload-types.ts "app/(payload)/admin/importMap.js" && pnpm check:generated && pnpm check:migrations
pnpm seed:demo --target 127.0.0.1/langlang_dev --confirm; pnpm dev -p 3602
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3602/info/about-the-club   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3602/info/draft-season-plan   # 404
curl -s http://127.0.0.1:3602/sitemap.xml | grep -c "/news/"                            # published posts only
```

Manual: in `/admin` as an editor, click "Add a page", fill title and one text block, tick "Show in the menu" (Clubhouse), set Published, Save; the page appears in the Clubhouse menu and the footer within seconds with no code change. "Post news" likewise adds a post and the home strip.

### P12. Risks

- Menu overflow: capped by the primary rule (two pages) and by defaulting new pages to the Clubhouse group.
- Committee confusion between announcements, stories and news: help text, P1 rationale and the two doc pages explain it.
- Rich text security: reuse of the existing sanitised renderer, no raw HTML field, links validated, no script or iframe block.
- Slug changes break links: slugs are stable after create; the admin can edit one deliberately (no redirect table in W1; deferred).
- Scheduled posts appear up to five minutes late (ISR). Documented.
- The `club` global gains columns: migration reviewed so existing saved values are untouched.
- The admin menu grows to 16 entries (accepted, see P6).

---

## 4. Interfaces that W2 and later waves rely on (stable contracts)

W2 must reuse these and must not reimplement them. Exact names may be adjusted during implementation only if this section is updated in the same commit.

### 4.1 Theme

```ts
// lib/theme/tokens.ts
export type BrandKey = 'black' | 'ink' | 'charcoal' | 'gold' | 'gold-dark' | 'gold-light' | 'gold-pale' | 'gold-deep' | 'cream' | 'stone' | 'grey' | 'grey-light'
export type FontKey = 'barlow-condensed' | 'oswald' | 'bebas-neue' | 'anton' | 'playfair-display'

// lib/theme/resolve.ts  (pure, no Next imports; resolveTheme(null) is the seed)
export type ResolvedTheme = {
  colors: Record<BrandKey, string>      // '#RRGGBB', for satori, canvas, PDFs, emails
  channels: Record<BrandKey, string>    // '11 11 13', for CSS variables
  font: { key: FontKey; label: string; family: string; ogWeight: number }
  crest: { url: string }                // theme.crest, else legacy club.logo, else BRANDING.logo
}
export function resolveTheme(doc: unknown, opts?: { clubLogoUrl?: string | null }): ResolvedTheme   // the ONLY crest resolution: theme.crest, then opts.clubLogoUrl (legacy club.logo), then BRANDING.logo

// lib/theme.ts  (server-only; cached per request; reads `theme` and the legacy club logo URL and passes it as clubLogoUrl; falls back to the seed if the DB is down). getClub().logoUrl is unchanged and does not read the theme.
export function getTheme(): Promise<ResolvedTheme>

// lib/theme/fonts-server.ts  (server-only; reads assets/fonts via node:fs; memoised)
export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: 'normal' }
export function loadThemeFonts(theme: ResolvedTheme): Promise<OgFont[]>   // [{ name: 'Display', ... }, { name: 'Body', ... }]

// lib/theme/og.tsx  (server-only)
export function themedImageResponse(
  render: (ctx: { theme: ResolvedTheme; crestDataUri: string | null }) => React.ReactElement,
  opts: { width: number; height: number; headers?: Record<string, string> },
): Promise<ImageResponse>
```

The stat card is the reference implementation of an OG route: `fontFamily: 'Display'` for headings and numbers, `'Body'` for labels, colours only from `ctx.theme.colors`. Any new OG route adds `./assets/fonts/**` and the crest to `outputFileTracingIncludes` in `next.config.ts`. The crest loader, currently private to the card route (`loadCrest`, 10 minute cache, 2 second timeout), moves into `lib/theme/og.tsx` so every OG route shares it.

Components keep using Tailwind classes (`bg-brand-gold`, `text-brand-gold-deep`). No hex literals anywhere outside `payload/seed/theme-defaults.ts` (guard test).

### 4.2 Match store

```ts
// lib/match-store/db.ts
export function matchTables(payload: Payload): MatchTables      // drizzle tables, camelCase column keys
export const MATCH_COLUMN_KEYS: Record<keyof MatchTables, readonly string[]>

// lib/match-store/queries.ts  (server-only; every function states FINAL-only and hides hidden players)
export function getMatchByGameId(gameId: string): Promise<StoredMatch | null>           // match + innings + rows, names resolved

// W1 ships only getMatchByGameId. listMatches, listPlayer* and headToHead are deferred to W2 (no consumer yet, and they would bake an unproven contract); W2 adds them against the indexes in M6.

// pure helpers (no DB, unit-tested)
// lib/match-store/aggregate.ts
export function aggregateFromMatchRows(rows: PlayerRows): SeasonCounts                  // same shape as player-seasons counts

// lib/match-store/names.ts
export function resolveRowName(row: { player: number | null; displayName: string | null }, players: ReadonlyMap<number, { name: string; hidden: boolean }>): string   // hidden -> "a club player"; bowler and fielder resolve through appearance ids
```

Rules for W2: reference `matches.id` or `gameId`, never child row ids; reads state their filters (the collections are staff-read only); never render a club person from stored text; ball-by-ball and phase features are out of reach of this source (M1); switching `player-seasons` to derived is a W2 decision after the nightly mismatch counter has been zero.

### 4.3 Pages, news and navigation

```ts
// lib/navigation-queries.ts  (no navigation global; base links come from club-defaults.navigation plus published pages)
export function getNavigation(): Promise<{ primary: Link[]; clubhouseLabel: string; clubhouse: Link[]; cta: Link; footerHeading: string; footerColumns: Link[][] }>
// lib/pages-queries.ts, lib/news-queries.ts (server-only; explicit published filter)
export function getPublishedPage(slug: string): Promise<PageView | null>
export function listLatestNews(limit: number): Promise<NewsSummary[]>
export function getPublishedPost(slug: string): Promise<NewsView | null>

```

A later wave adds a block by adding one entry in `payload/fields/blocks.ts`, one component in `components/blocks/` and one case in `render-blocks.tsx`; the test that pins "exactly three blocks" is updated in the same change. W2 candidates already designed: `gallery`, `documents`, `people` (fed only by `lib/people-queries.ts`) and `sponsors`.

## 5. Final Verify step (once, at the end of W1)

1. `pnpm tsc --noEmit`, `pnpm lint`.
2. `pnpm generate`, `git add` the generated files, `pnpm check:generated`, `pnpm check:migrations`.
3. `pnpm test` (unit), then `pnpm test:int` (sequential; both share the test DB, never run two vitest processes at once).
4. One `pnpm build` (output tailed).
5. Screenshot comparison from WP-T section T5b, the stat card eyeball check, the backfill dry run, and the manual committee walk-throughs in T8 and P11.
6. Docs: `tests/feature-docs.test.ts` passes with the four new docs (`theme-editor`, `match-data-store`, `pages`, `news`) and the updated ones (`stat-cards`, `multi-club-template`, `club-and-site-settings`, `fixtures-and-scorecards`, `playhq-player-sync`, `announcements`, `home-page`, `seo`, `committee-admin`, `index`), DESIGN.md section 13 and the README.

---

## Appendix A. Review findings rejected or only partly accepted

Findings not listed here are accepted as written. The following were rejected, accepted only in part, or accepted with a changed mechanism:

- **Finding 18 (over-engineering), partly.** Accepted: dropped `finish`, the three role aliases, `ResolvedTheme.white`, `deriveShades` and `derive.ts`, and the fitted `goldRamp`. Not accepted as stated: "the admin ramp must be exact for Lang Lang, so seed ten stops". The ramp is built with `color-mix()` and its small admin-only deviation is an accepted, measured delta (T3), with seeding ten stops as the documented fallback if the measured error exceeds 6 per channel.
- **Finding 20 (Lang Lang defaults out of code), partly.** Accepted: the production startup assertion, `.env.example`, function `defaultValue`s so migrations are club-neutral. Not accepted: deleting the Lang Lang values from `config/site.ts` outright. They remain as non-production defaults so local dev, tests and the demo seed run with no env; production has no fallback.
- **Finding 21 (`REDIRECT_HOSTS`), partly.** Accepted as a blocker, and the default is not changed until the checklist line is written. Not accepted: leaving the old default permanently; it flips in the same commit as the blocker line.
- **Finding 22 (export filename), resolved by a setting.** `EXPORT_FILENAME_PREFIX` keeps Lang Lang's `langlang-` name; deriving from `club.shortName` is only the fallback for a new club.
- **Finding 29 (overlapping content types), partly.** Accepted: one-paragraph News versus Stories justification, blocks cut to three. Not accepted: folding News into Stories or Announcements with a `kind` field (reasons in P1), so the cap stays 14 to 16.
- **Finding 31 (cap comments), consistent with 29.** The cap comments stay because Pages and News are both kept. The extra "Matches (data)" entry is dropped as requested.
- **Finding 11 (capture real shapes), accepted with a fallback.** At most five sequential read-only GETs are planned (M9), with names replaced; if no suitable game is found, the backfill logs unknown shapes instead.
- **Finding 14 (cut queries), accepted.** `partnerships.ts`, `headToHead`, `listMatches` and `listPlayer*` leave W1; only `getMatchByGameId` remains in section 4.2.
- **Finding 6 (cap), accepted by removal.** Nothing is justified by a measured write time, so the cap and `matchIncomplete` are gone.

