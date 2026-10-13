# Wave G: admin loading fixes, Social posts composer, whole-admin redesign

Status: design. Branch `feat/payload-cms`. Tracking issue #38 (read only). Evidence: `2026-10-13-admin-audit-live-preview.md` (the owner's walk of the live preview; not repeated here). This wave has no new public pages and no new money or personal data.

Goal: a non-technical committee member finds the admin obvious, calm and pleasant on a phone and a desktop, and the same code serves any club through the `theme` global. Every club-specific value (colours, crest, fonts, names, copy, hosts, cookie names) comes from config; Tailwind-free admin CSS uses only the `--brand-*` variables (no hex outside the theme mapping); no club name in code outside `config/site.ts` and seed defaults (guard tests exist and stay green).

Reuse, do not rebuild: `resolveTheme` + `themedImageResponse` (W1), the match-store query helpers and `lib/social/*` (W1/wave C), the selector area, availability links and PIN throttle (announce-teams; untouched here), the notification centre (`payload/components/NotificationCentre.tsx`), and the committee navigation (`payload/admin/navigation.ts`, `visibility.ts`). Staff means admin or editor only; selectors are a separate role and never reach these screens (`tests/staff-guard.test.ts`).

## 0. Findings from reproducing the audit locally (before design)

Local dev (`langlang_dev`, port 4500, a throwaway admin created with `seed:admin`), Chrome at 1440 wide. Screenshots (1440, current state): Home `/var/folders/fb/4n4m4y5526s8qtqg5q55sfb40000gn/T/claude-chrome-screenshots-A9ljd4/screenshot-1791896290833-0.jpg`, Social posts `.../screenshot-1791896290834-1.jpg`. 390px captures are taken per work package as "before" shots (section 9), because the spec only redesigns what it photographs.

Confirmed in code or by running it:

1. **A blank cream page while the server works.** The first load of `/admin` rendered an empty cream page (Payload's `RootLayout` background, nothing else) until the whole server render finished; the same happens on `/admin/login`. There is no `loading.tsx`, no `Suspense` around the page body, and the custom views `await` 4 to 8 queries before sending a byte (`SocialView`: settings, club, queue, heartbeat; `Dashboard`: club, notification centre, milestones, sync panel). On a cold serverless instance with a remote database that is the 10 to 20 seconds the owner saw. `RootLayout` also awaits `getTheme()` (two database reads, fatal on Vercel production if they fail) before anything streams.
2. **`requireUser` can turn a slow or failed session lookup into a login bounce, and it drops the query string.** `payload/components/AdminPage.tsx` `requireUser(view, path)` redirects to `/admin/login?redirect=<path>` whenever `isStaffUser(req.user)` is false. Payload resolves `req.user` through `executeAuthStrategies`, which catches any error from the session lookup (`findByID` with `useSessions: true`) and returns `user: null` after logging it. So one transient database timeout or an exhausted pool (`DATABASE_POOL_MAX` default 5, shared by every RSC render a page triggers) looks exactly like "not signed in". The login page then renders, finds a user on its own (second, successful lookup) and redirects straight back: the bounce the owner saw, with a blank login page in between (finding 1). The redirect value is built from the fixed view path (`'/social'`), so the query string is never part of it: deep links die in the bounce.
3. **A signed-in non-staff user loops.** A signed-in selector or disabled user who opens a custom view is redirected to the login page; Payload's `LoginView` redirects any signed-in user to `redirect`; the custom view redirects again. That is an endless redirect, not a message. The view must render "this is for the committee" instead of redirecting when someone is signed in.
4. **The Social composer loses its state even with a valid session (reproduced locally).** `view.searchParams` and `initPageResult.req.url` arrive empty at the view for a hard load of `/admin/social?type=sponsor-thanks&source=1,2&style=bold&size=landscape` (a debug log in the view printed no keys; the page function logged one render with `{}` and a second with the parameters). The composer's `useEffect` then calls `history.replaceState` to `/admin/social` with no query, erasing the deep link in the address bar. Two defects, both fixed in WP-0: the composer must not rewrite the address until it has read it, and it reads state on the client from `window.location.search` (the URL is the source of truth) instead of depending on server props that can arrive empty.
5. **First clicks do nothing** is the same cause as finding 1 seen from the other side: the page is server-rendered late and hydrates late, with the entire composer (and the queue below it) in one client bundle and no skeletons. Fix: shell first, skeletons for slow regions, small client islands.
6. **Sponsor logos are "undrawable" because of the format, not the data.** `sponsorChoices()` (`lib/social/sources/content.ts`) accepts a logo only if `isDrawableImageType` (PNG or JPEG) and `loadImageDataUri` succeeds. Local sponsors 1 to 4 (the ones with logos) are `image/webp`, so they all fail; satori cannot draw WebP. Contributing causes: the fetch goes to the site URL over HTTP with `redirect: 'error'` and a short timeout (a protected preview answers with a redirect or 401), only `resolveServerURL()` and the Blob host are allowed, and a failed result is cached for the life of the process (`imageCache.set(key, null)`). Fix in WP-2: read the file through Payload's storage adapter (server side, no HTTP round trip to ourselves), convert WebP, GIF, AVIF and SVG to PNG with `sharp` (already a dependency), cache successes only, and tell the person which logo failed and why when one still cannot be used.
7. **Cannot be verified from here:** the HEAD/RSC 503 responses under Vercel deployment protection. They are consistent with finding 2 (function errors or timeouts under load, then `user: null`) but are not reproduced. WP-0 therefore also adds the diagnostics that would prove it: a server-timing log line per admin render (auth ms, theme ms, view ms), and a log of "session lookup failed" distinguished from "no cookie". Acceptance does not depend on identifying the 503s: an auth lookup that errors is retried once and, if it still errors, shows a calm "we could not check your sign-in, try again" page instead of a bounce.

## 1. Design direction (frontend-design pass)

**Tone: calm, warm, club-house, not dashboard-y.** The public site is bold (black, gold, condensed display type, DESIGN.md). The admin keeps the same brand but turns the volume down: paper-warm surfaces (`brand-stone` and `brand-cream`), white cards, ink text, the club gold used sparingly (primary action, active state, focus ring, the 4px gradient rule at the top of the sidebar, as on the public nav and footer). The display font appears only on page titles and the Home greeting. Body is the Inter stack already loaded. One idea carries the whole admin: **every page is a short sentence plus one obvious next step.**

Differentiator that makes it feel like this club's tool rather than Payload: a task-first sidebar with a crest header, grouped by what people do (Today, Club website, People and game day, Club office, Help), icons, and the current club's own colours. A phone gets a bottom action bar and a slide-over menu, not a squeezed desktop sidebar.

### 1.1 Tokens (one admin stylesheet, one mapping)

All values come from the `theme` global through the `--brand-*` channel triples already placed on `<html>` by `app/(payload)/layout.tsx`. A single file, `payload/components/admin-theme.css`, maps them onto Payload's variables and defines the admin's own semantic tokens; nothing else in the admin stylesheet names a colour. (`admin.css` today has hex-free colours except `background:#fff` on the crest tile; that becomes `rgb(var(--brand-white-ish))`: a new `--admin-surface` token.)

| Token | Built from | Use |
| --- | --- | --- |
| `--admin-bg` | `--brand-stone` | page background |
| `--admin-surface` | white mixed from `--brand-cream` at 40 percent | cards |
| `--admin-ink` | `--brand-black` | headings, primary text |
| `--admin-text` | `--brand-charcoal` | body |
| `--admin-muted` | `--brand-grey` (never lighter than `--brand-grey-light`; 4.5:1 on surface) | help text, meta |
| `--admin-line` | `--brand-black` at 10 percent | borders, dividers |
| `--admin-accent` | `--brand-gold` | primary button fill, active marker, focus ring |
| `--admin-accent-ink` | `--brand-gold-deep` | gold text on light (4.84:1 on gold-pale) |
| `--admin-tint` | `--brand-gold-pale` | selected row, callout, active nav |
| `--admin-danger`, `--admin-danger-tint` | theme-independent red-700 / red-50 (as the public error box) | errors only |
| `--admin-ok`, `--admin-warn` | green-700 / amber-800 on their 50 tints (status pills; fixed, not brand, so state colour never depends on a club palette) |

Payload variable mapping (all in the same file): `--theme-bg`, `--theme-elevation-0..1000` (ramp from `--admin-surface` to `--admin-ink`), `--theme-success-*` (existing gold ramp, kept), `--theme-error-*`, `--font-body`, `--font-serif` (the display font for titles), `--style-radius-s/m/l` (6, 10, 16 px, from DESIGN.md radii), `--base` (spacing grid). Primary buttons stay gold on black text. A contrast unit test reads the resolved seed theme and asserts 4.5:1 for text tokens on their surfaces and 3:1 for the focus ring and borders of controls; `ThemeContrast` (existing) already guards the theme editor, so a club that picks low-contrast colours is stopped there.

### 1.2 Type, spacing, shape, motion

- **Type scale (rem):** page title 1.75 to 2.25 (display font, clamp), section title 1.125 (600), body 1 (16px minimum on inputs, no iOS zoom), small 0.875, micro label 0.75 uppercase tracked only for the sidebar group labels. Line height 1.5 body, 1.2 titles. Help text 0.875 muted, one sentence, max 60 characters per line.
- **Spacing grid:** 4px base; 8, 12, 16, 24, 32, 48. Page gutter 16px on a phone, 32px from 1024. Card padding 16 (phone) and 24. Page max width 1200px; forms 760px; Social composer uses the full width.
- **Shape:** radii 6/10/16; one shadow (`shadow-card` equivalent) only on raised cards, otherwise 1px `--admin-line` borders. No yellow left-borders anywhere (the audit's "inconsistent card borders").
- **Targets:** every control at least 44px tall on phone, 40px on desktop; hit areas, not just glyph sizes.
- **Motion:** 150 ms ease-out-quint, opacity and transform only; skeleton shimmer; everything under `@media (prefers-reduced-motion: reduce)` becomes instant and the shimmer becomes a static tint.
- **Focus:** a 2px gold ring offset 2px (3:1 on both surfaces), visible on every interactive element; skip link to main content.
- **Dark mode:** not in this wave (admin `theme: 'light'` stays); tokens are structured so it is a later token swap.

### 1.3 Shared component kit: `payload/components/ui/*`

Presentational, no data fetching, server-safe unless marked client. Each has a unit test (render, accessible name, keyboard) and appears on a development-only `/admin/ui-kit` page used for the before/after gallery (hidden from navigation, admin only, 404 in production).

| Component | Notes |
| --- | --- |
| `Card`, `Section` | surface, optional heading and action slot; `Section` adds the title-plus-help pattern |
| `PageHeader` | title, one-sentence lead, primary action, breadcrumb back link; replaces the repeated `club-page__title` and `club-page__lead` markup |
| `Button`, `LinkButton`, `IconButton` | primary (gold), secondary (outline), quiet, danger; busy state with spinner and `aria-busy`; replaces `btn--style-*` in custom views |
| `Badge`, `StatusPill` | tone (ok, warn, danger, info, neutral) with an icon or text, never colour alone; plain words ("Showing on the website", "Hidden", "Draft") |
| `Tabs`, `Segmented` | roving tabindex, arrow keys, `aria-selected`; Segmented is the size/style chooser |
| `RadioCard`, `Checkbox`, `Switch` | styled native inputs (appearance reset, real `<input>` kept for forms and a11y) |
| `Field`, `TextInput`, `TextArea`, `Select` | label, help, error wiring; 16px text; no browser default chrome |
| `SearchPicker` | client; combobox pattern (`role="combobox"`, listbox, `aria-activedescendant`), search box, grouped rows, rich row slot (thumbnail, title, subtitle, badge), single or multi select with a chip tray, empty and loading states, virtualised past 200 rows |
| `EmptyState` | icon, one sentence, one action |
| `Skeleton`, `SkeletonRows` | shimmer blocks sized to the real content to avoid layout shift |
| `Toast` provider + `useToast` | polite live region; success and error; auto-dismiss 5 s unless error |
| `StickyActionBar` | bottom bar on phone, sticky footer in forms; holds Save and a save-state line ("Saved just now", "Unsaved changes", "Saving...") |
| `Avatar`, `Thumb` | player photo or initials in a theme tint; sponsor logo thumb with a contain fit on a checker-free paper tile |
| `Icon` | see below |
| `Disclosure` | styled `<details>` for "Details" and "More" areas |

**Icons:** `lucide-react` is not a dependency (DESIGN.md notes `components.json` wrongly says lucide); the repository already ships `@hugeicons/react` + `@hugeicons/core-free-icons`, imported by `lib/club-icons.ts` for the public site. The admin uses the same package through one registry, `payload/components/ui/icons.ts`, mapping nav and action keys to a fixed set of about 30 icons so the bundle stays small (named imports only). No new dependency. If an icon is missing from the free set, the registry holds an inline SVG for it.

**Microcopy rule:** committee-facing text never says collection, global, slug, relationship, document, derived, sync run, field, doc, or "populate". A unit test (`tests/admin-microcopy.test.ts`) scans the `label`, `admin.description`, `placeholder` and custom-view string literals of every non-admin-only collection and the committee-facing components for those words (a short allowlist for admin-only Advanced screens). Words to prefer: "item", "list", "web address", "photo", "showing on the website".

### 1.4 Extension points used (Payload 3.90.2, no node_modules patches)

`admin.components.graphics` (Logo, Icon), `beforeNavLinks` and `Nav` (replaced by `AdminNav` as today, extended), `views` (dashboard and custom views, each wrapped by one `AdminShell`), `beforeLogin` / `afterLogin` (branded login copy), `providers` (a single `AdminProviders` client provider: toasts, theme CSS, keyboard shortcuts), field `admin.components.Field/Cell` (photo uploader preview, status pill cells, people pickers), collection `admin.components.beforeList` (search and filter bar), `admin.components.edit.beforeDocumentControls` and `actions` (sticky save bar), `admin.css` through `app/(payload)/custom.scss`. Anything Payload does not expose (for example the document-controls DOM) is restyled with scoped CSS on its stable class names, never by patching.

## 2. WP-0: P0 fixes (ship first, own commit set)

### Behaviour

1. **Never a blank screen.** Add `app/(payload)/admin/[[...segments]]/loading.tsx` rendering the shell skeleton (sidebar skeleton with the crest from the already-resolved theme CSS variables, page-header and card skeletons). It uses only CSS and the `--brand-*` variables set on `<html>` (no data). `RootLayout` stays; `getTheme()` is made non-blocking: the variables are read from a short in-process cache with a stale-while-revalidate refresh (one read per minute per instance), and on failure the seed theme is used for the admin (the admin never fails because the theme read failed; the public-site fatal rule stays untouched). Login gets its own `beforeLogin` content so the page is meaningful immediately.
2. **Auth that cannot bounce falsely.** Replace `requireUser(view, path)` with `requireStaff(view)`:
   - `req.user` staff: continue.
   - No user and no auth cookie: redirect to `/admin/login?redirect=<full path and query>`. The redirect value is built from the real request (the path plus `searchParams` re-serialised, or `x-url`/`next-url` header), URL-encoded, length-capped (2000), and must pass Payload's `getSafeRedirect` (relative, starts with the admin route, no scheme).
   - A cookie is present but the lookup returned null: retry the lookup once with a fresh `payload.auth({ headers })`; if it succeeds continue; if it still returns null with a logged error, render `AuthTroubleNotice` ("We could not check that you are signed in. Reload, or sign in again." with a Reload button and a Sign in link carrying the redirect), HTTP 200, never a redirect.
   - Signed in but not staff (selector, disabled): render `NoAccessNotice` ("This part of the admin is for the committee.") with a link to the right place (selector area for a selector). No redirect, so no loop.
3. **The login page is never blank and honours `redirect`.** `beforeLogin` renders a branded intro; the form is Payload's. A signed-in visitor to `/admin/login?redirect=...` goes to the redirect (Payload does this; test it with a query string and an encoded path). Unsafe redirects fall back to the admin home.
4. **Deep-link state survives.** Social composer (and every other custom view that has state in the URL: Selectors, Office filters, Fantasy tabs) treats the URL as the source of truth: state is initialised from `useSearchParams()`/`window.location.search` on the client at mount (server props are only a fast first paint), and the address is rewritten only after that initial read and only when the state differs. A unit test with an empty server prop and a populated address proves the composer selects the type and items.
5. **Fast interactivity.** Views render a header and skeleton immediately: slow data goes into `Suspense` regions (server components) so the shell, tabs and the first step are interactive while queue rows, previews and lists load; the composer's client bundle is split (dynamic import for the preview and scheduling panels); no view awaits more than one query before first paint. Interactive controls get `disabled` plus a skeleton until hydrated (`useHydrated`) instead of looking live and doing nothing.
6. **Diagnostics.** One structured log line per admin render in `AdminShell` (route, auth ms, theme ms, view ms, whether the lookup retried) and a counter on the Advanced "System health" card (WP-3): "Sign-in checks that needed a retry in the last 24 hours". Nothing personal is logged.

### Data model, access, migrations, classification
None. No collection or global change, so no migration. No new endpoint; `AdminShell` reads the existing request.

### Tests
- Unit: `requireStaff` decision table (no user + no cookie, cookie + null user once then ok, cookie + persistent null, selector, disabled, editor, admin) with a stubbed `payload.auth`; redirect builder (query preserved, encoded, capped, unsafe schemes and `//evil.test` rejected); `getSafeRedirect` behaviour with our values; composer initial state from the URL; `loading.tsx` renders with no data.
- Int: with a throwing session lookup the view returns `AuthTroubleNotice`, never a redirect; with a selector session `/admin/social`, `/admin/office`, `/admin/selectors` return the notice (and no `Location` header); anonymous gets a 307 to login whose `redirect` carries the full query (`tests/int/admin-auth-bounce.int.test.ts`).
- Security: the notice pages leak no data; `staff-guard` test extended to ban `req.user` truthiness in views.

### Docs and seed
Update `docs/features/committee-admin.mdx` (loading and sign-in behaviour, the "could not check your sign-in" message). Seed: none.

### Acceptance (local)
`curl -b jar localhost:45xx/admin/social?type=...` HTML contains the page header and skeleton markers before data; Chrome hard load of the deep link ends with the exact state selected and the same address; simulated database slowness (`pg_sleep` via a test hook env `ADMIN_TEST_AUTH_DELAY_MS`, off by default and refused outside `NODE_ENV=test`) shows the skeleton, not blank; a selector-role account sees the notice, no loop.

### Risks and decisions
- If Next serves the page function a first render with empty `searchParams` in production too (seen in dev), the client-side read in item 4 is the fix; do not rely on server props. Verified in WP-0 against a production `next build` in the final step only.
- No external credential needed. The 503s under Vercel deployment protection are a hosting setting (preview protection should let the owner's session through or use a bypass token); flag to the owner, not code.

## 3. WP-1: admin shell, tokens, sidebar, login, UI kit

### Scope
- `payload/components/admin-theme.css` (tokens and Payload variable mapping), `admin.css` reorganised into per-component partials under `payload/components/ui/`, `AdminProviders`, `AdminShell` (wraps custom views; replaces `AdminPage`; `AdminPage` stays as a thin alias so nothing breaks mid-wave), the `ui/*` kit (section 1.3), the icon registry.
- **Task-first sidebar** (`AdminNav` plus `navigation.ts`):

| Group (committee) | Entries |
| --- | --- |
| Today | Home, Waiting for approval (badge) |
| Club website | Events, News, Announcements, Photo gallery, Sponsors, Pages, Documents |
| People and game day | Players, Committee and contacts, Player sponsors, Social posts, Selectors |
| Club office | one entry (existing) |
| Help | Help |

  Everyday editor menu stays short: the groups are labels, not extra entries. `Social posts` and `Selectors` move from Advanced to "People and game day" for editors (they are weekly jobs) with `forEditors` unchanged in access terms. `advancedNav` (admin only) remains a collapsed "Advanced" group; "Sync runs", "Player aliases" and "Player seasons" are grouped under one "Player data" sub-heading, not deleted. No new entry is added to the committee menu; the cap test (`tests/admin-visibility.test.ts` everyday-list length) is updated only if an entry moves, with the reason in the test comment.
  Each entry has an icon, the active state is a tint plus a 3px accent bar (not a yellow pill), badges are pills, and the crest header shows the club name from the club global. The bottom has the person's name, role in plain words ("Committee" / "Site admin") and a labelled "Sign out" (not a bare icon). A search box ("Jump to...", `/` to focus) filters nav entries and a few recent items client-side (no server call; the menu list is already in the page). On a phone the sidebar is a slide-over opened by a labelled Menu button, with a focus trap and Escape to close.
- **Branded login:** `beforeLogin` shows the crest, the club name, "Sign in to look after the website" and a one-line help ("Forgot your password? Use the link below the form" only when the email adapter is configured). Payload's form is restyled to the kit inputs and the gold button; Facebook sign-in is not part of `/admin` (selectors only) and is not shown.
- **Not touched:** access, role visibility, `visibility.ts` semantics, collection `admin.group: false`.

### Data, access, migrations, classification
No data model change; no migration. Navigation classification stays in `navigation.ts`; `admin-visibility.test.ts` extended: every nav entry has a known icon key and a group; editors never receive an admin-only entry.

### Tests
Unit: kit components (a11y names, keyboard for Tabs/SearchPicker/Segmented, StatusPill never colour-only), nav grouping per role, `isNavActive` for grouped entries, contrast test on the resolved seed theme, microcopy test. Visual: before/after screenshots at 1440 and 390 of sidebar, login, Home shell, one list, one form (scratchpad gallery).

### Docs and seed
`docs/features/committee-admin.mdx` (menu groups, login), new `docs/features/admin-design-system.mdx` (for the site admin: how the look follows Site look, what the shared pieces are; Persona: site admin and developer). Index updated. `DESIGN.md` gets an "Admin design system" section (tokens table above, component list, rules). Seed: none.

### Acceptance
390px: no horizontal scroll on any shell screen, menu button 44px, focus ring visible, tab order logical; changing the Site look colours changes the admin within a refresh (manual check with the theme global in dev).

### Risks
Payload's class names change between minor versions: styling targets only documented classes and the `data-` hooks; the Payload version is pinned (3.90.2). Replacing `Nav` content must keep Payload's own mobile nav toggle working; use `beforeNavLinks` plus CSS rather than replacing `Nav`.

## 4. WP-2: Social posts rebuilt

Sources: owner audit, issue #23 (scheduled posting and auto summaries, the part already built stays), `docs/features/social-graphics.mdx`, `social-posting-queue.mdx`.

### UI (route `/admin/social`, committee only)

Tabs (Segmented) across the top: **Make a post** (default), **Posts** (queue; badge for "needs attention"). State in the URL: `?tab=`, `type`, `source`, `style`, `size`, `text`, `post`.

Make a post, two columns from 1024px (steps left 5/12, preview right 7/12, sticky `top: header height + 16`), one column on a phone with the preview first-class: a sticky mini bar at the bottom shows size tabs and "Download", "Share", "Schedule" (StickyActionBar), and a "Preview" button scrolls to the preview.

Left column, collapsible numbered steps (each shows its chosen value when collapsed, so progress is visible):
1. **What kind of post** (RadioCard grid with an icon each; 10 types; the label is the existing `GRAPHICS[key].spec.label`, the hint is one short line).
2. **Pick the game / sponsors / player / event** via `SearchPicker` (multi where the type allows). Rows by type:
   - Games: date tile (day, month), "Senior Men 1 Day, Round 14", opposition, a result Badge (Won / Lost / Tied / Draw / No result) and the score line ("LLCC 5/172 v UBCC 9/168"). Grouped by round or month, searchable by opposition, grade or date text, newest first, finished games first for results, upcoming first for previews. The grade numbering prefix ("9.") is stripped in a pure `displayGrade()` helper (tested).
   - Sponsors: logo Thumb (the drawn PNG, see below), name, tier Badge; a muted "name only" tag when the logo really cannot be drawn (not a sentence per row). Multi-select with a chip tray and a 4-item limit note.
   - Players (potm, milestone): photo Avatar, name, one stat line.
   - Events: cover thumb, title, date.
3. **Options** (only those the type has): thank-you line / extra text next to the preview-affecting field, style as three visual swatches (a live mini thumbnail per style in the club colours, not a bare radio), "Show" toggles from the existing `TEXT_FIELDS`.
4. **Caption**: the existing generated caption in a textarea with a live character count per network, hashtags as chips, "Reset to suggested".

Right column: the live preview image (loading skeleton at the exact aspect ratio; the preview debounce and caching stay), size Tabs (Square 1080x1080, Portrait 1080x1350, Landscape 1200x630; the dimensions are small text in `--admin-muted` on a white tab, contrast 4.5:1), and the actions: **Download** (primary), **Share** (Web Share API on phones, hidden otherwise), **Schedule...** (opens the scheduling panel in a dialog or inline step 5: networks, date and time in club time, the existing validation and reasons), **Save draft**. After download or schedule, a Toast and a link to the Posts tab.

Posts tab: its own page-like view with a real EmptyState ("Nothing waiting. Make a post to get started." plus the button), tabs (Needs attention, Scheduled, Posted, Drafts) with counts and the heartbeat explained in plain English ("Posts are sent by a daily job. The last run was 2 hours ago." instead of "Not checked yet"), rows with a thumbnail, caption start, networks as pills, a time, and plain-English status/reasons (existing `reasons.ts`).

### Graphics layout quality pass (`lib/social/render.tsx`, `fit.ts`, `density.ts`, `specs/*`)

- **Balanced compositions for 1 to 4 items.** Sponsor thank-you, lineup and leaders use a layout table keyed by item count and size: 1 item = hero logo centred at 55 percent of the content height; 2 = two equal cells in a row (landscape and square) or stacked (story/portrait), each at 40 percent; 3 = one over two (square), three across (landscape), stacked (portrait); 4 = 2x2. Logos are fitted with `contain` into a paper tile that is at least 60 percent of its cell; the whole group is vertically centred in the space under the headline; the empty-area rule below enforces it.
- **No large empty areas.** `fit.ts` gains `emptyShare(layout, size)`: the unused share of the content box after the budget calculation. A test runs every type x size x style with 1 to 4 items and fails above 28 percent unused for sponsor, results and leaders (the types the owner flagged; others reported but not failed in this wave). When a layout would be emptier, it scales logos/rows up (`fillRowsScale` extended to logos and to the single-name case) and enlarges the headline step.
- **Auto-fit text instead of ellipsis.** A `fitText(text, boxWidth, maxPx, minPx, lines)` helper (glyph-width estimate already in `fit.ts`, `GLYPH=0.58`, extended with per-font width tables for the bundled faces to be exact enough) picks the largest size that fits within 2 lines, then wraps to 2 lines, and only as a last resort at the minimum size truncates at a word with an ellipsis. `ellipsis` styles in `render.tsx` are replaced for opposition names, sponsor names, row text and details.
- **Public team names.** Graphics show the team's public name (the club name and the grade label from the name-and-grade-labels feature, `docs/features/name-and-grade-labels.mdx`), never the internal PlayHQ team name ("Lang Lang One Day"). One pure `publicTeamName(match)` in `lib/social/sources/shared.ts` used by results, toss, preview, lineup (tested with the audit's examples).
- **Sponsor logo fix** as in finding 6: `loadLogoDataUri(mediaDoc)` in `lib/social/logo.ts` (server only): reads bytes through `payload.db`-independent storage (local file in dev/test through the `media` upload directory; Blob server SDK on Vercel with the existing token, never a client token), converts WebP, GIF, AVIF, SVG to PNG with `sharp` (SVG rasterised at 2x with a size cap and no external references), trims transparent padding, returns `{dataUri, width, height}` or `{error: 'unsupported' | 'missing' | 'too_large' | 'unreadable'}`. Success cached by `id + updatedAt`; failures never cached longer than 60 seconds. `sponsorChoices()` returns `logo: 'ok' | 'none' | 'failed'` and the thumbnail URL for the picker (`/api/admin/social/logo/<id>` staff-only, returns the same PNG, `Cache-Control: private`). The logo field is the existing `sponsors.logo` upload; no new field.
- **All 3 styles x 3 sizes reviewed visually**: a script `scripts/render-social-gallery.ts` (admin-only dev tool; mocked data, no network) renders each type x style x size with 1, 2, 3 and 4 items into the scratchpad as PNGs and an HTML contact sheet; the reviewer judges the sheet critically (balance, contrast, no empties, no clipping, club colours) before the WP is accepted.

### Data model, access, migrations
No schema change (the queue collections and `social-settings` stay). New staff-only read endpoint for the logo thumbnail and a new `sources` response shape (additive, versioned by a field, old clients ignore it). All `/api/admin/social/*` endpoints keep `isStaffUser` (not "any user"); the new logo endpoint returns 404 for a non-sponsor media id so it cannot be used to read any media row. No Facebook, Instagram or X call is added; adapters stay stubs, the mock network exercises the flow, real networks stay env-gated. No migration.

### Tests
Unit: `displayGrade`, `publicTeamName`, `fitText`, `emptyShare` matrix (type x size x style x 1..4 items), logo conversion (a WebP, a PNG, an SVG, a corrupt file, an oversize file; fixtures generated with `sharp` in the test), game-row builder (result badge, score, grouping), composer URL-state, SearchPicker keyboard and multi-limit, Posts empty state. Int: `sponsorChoices` with a WebP logo returns `ok`; logo endpoint is staff-only (anonymous 401, selector 403) and 404s for non-sponsor media; deep-link render. Existing `social-*` tests stay green (`social-render`, `social-fit`, `social-specs`).

### Docs and seed
Update `docs/features/social-graphics.mdx` (composer layout, picker, logo formats, fitted text) and `social-posting-queue.mdx` (Posts tab). Seed:demo: add two sponsors with PNG and SVG logos (generated in code, no downloads), one game with a long opposition name and one grade needing a numbering prefix, and a draft and a scheduled post, so the preview shows every state.

### Acceptance
Deep link from the owner's report opens that exact graphic; 12 sponsors show thumbnails (WebP now drawable); no row says "no logo we can draw"; contact sheet passes `emptyShare` and shows no ellipsis in the audited cases; preview stays in view while scrolling the steps at 1440; at 390 the action bar is reachable with one thumb; Posts tab empty state shown with an empty queue.

### Risks and decisions
`sharp` on Vercel is already used (`payload.config.ts`); SVG rasterisation of untrusted markup is the risk, so it runs with `sharp`'s librsvg (no script, no external fetch) and a size cap. External decision: none for this wave (posting to real networks remains blocked on Meta/X app review and credentials, issue #23; do not fake it).

## 5. WP-3: Home dashboard

### Layout (mobile first)
1. Greeting (display font, first name) and one sentence for today ("Two things are waiting for you." or "You're all caught up.").
2. **Needs your attention**: rendered only when at least one item exists, in plain English with a single action per row and a count Badge; items come from `NotificationCentre`'s existing sources with a rewrite layer `lib/admin/attention.ts`: "3 volunteer spots are still empty for Thu 15 Oct" with an "Open volunteers" button; "2 posts need a look" ; "1 story is waiting for approval". Sync internals (matches saved, not saved, totals disagree, sync runs) move out of committee view into Advanced > "System health" (admin only; the existing counts and the sync panel, plus the new retry counter from WP-0). If the list is empty the section is omitted entirely, no "nothing to do" box.
3. **Quick actions**: 4 to 6 primary buttons, role-aware, chosen from `jobTiles` by a new `primary: true` flag with a plain icon each: Make a social post, Add an event, Post news, Add photos, Add an announcement, Update the website sponsors (the exact six may be tuned in review; the rule is at most six). A "More" Disclosure holds the remaining tiles as a compact two-column list (not a 14-tile grid).
4. **Season at a glance** card: current record (played, won, lost), next game, last result, ladder position when the data exists (read from the match store through existing `lib/*-queries.ts`; hidden when there is no data), each a link to the public page.
5. **Milestones** as a tidy card: up to 4 rows (avatar, name, "2 runs from 1,000") and a "See all" link, replacing the bullet list with underlined links.
6. **Advanced (site administrators)**: a closed Disclosure below with System health and the existing admin cards, visible to admins only.

### Data, access, migrations
No schema change. All reads use the Local API with the viewer's role and the existing helpers (`getPendingCounts`, notification sources, `lib/stats` queries); the new `attention.ts` is pure over those results (tested). Admin-only items never reach editors (existing `admin-notifications.test.ts` extended). No migration; classification unchanged.

### Tests
Unit: `attention.ts` (empty returns empty, plain-English strings, no banned words, admin-only items filtered for editors), `jobTiles` primary count <= 6, season card builder with and without data. Int: Dashboard renders for admin and editor and an empty database. Visual 1440 and 390.

### Docs and seed
Update `docs/features/admin-notifications.mdx` and `committee-admin.mdx`. Seed:demo already has volunteers, stock, diary, so attention rows exist; add a finished and an upcoming senior game and one milestone-near player if absent so the season card and milestones show.

### Acceptance
With an empty attention list the section is absent; with the demo seed it lists plain sentences each with one button; the page has one h1 and sensible landmark order; no horizontal scroll at 390.

### Risks
The season card must not call PlayHQ (reads the stored data only; run with `PLAYHQ_CLIENT_ID=` empty). Ladder position only if the stored ladder exists; otherwise omit.

## 6. WP-4: lists and forms

### Lists (collection `admin.components.beforeList` / Cell components; same everyday collections)
- Friendly columns per collection: Players (photo thumb, name, status pill "Playing now / Past player / Hidden", games this season), Sponsors (logo thumb, name, level pill, "Showing on the website"), Events (date tile, title, going count, status), News, Announcements, Gallery (thumbnail grid view option), People (photo, name, role), Documents (title, type chip, updated). Booleans never show raw `true`/`false`: a `StatusCell` with words and an icon.
- Plain search placeholder ("Search players by name") from a per-collection `admin.listSearchableFields` label map (no "Display Name Or Slug"); sort arrows only on columns where sorting means something (name, date); 25 rows per page default (`admin.pagination.defaultLimit: 25`, limits 25/50/100); filters as friendly chips ("Showing / Hidden", "Playing now") instead of the raw where-builder, with the builder still reachable under "More filters" for admins.
- Mobile: rows collapse into cards (photo, title, one status line) with a 44px tap target.

### Forms (edit pages)
- **Simplified layouts:** main column = what the committee edits; internal fields (`slug`, derived flags such as `isActiveDerived`, `source`, sync-owned values) move to a collapsed **Details** `Disclosure` at the end (admin-only fields are `condition`-hidden for editors already via `adminOnlyCondition()`, kept). "Show as: Select a value" gets a plain label and default. The sidebar column is dropped on phones.
- **Shorter help:** each `admin.description` rewritten to one sentence under 90 characters; the long paragraphs move to the page lead (one per page) or to Help. Done through a content pass on the committee-facing collections only; admin-only ones are lightly touched.
- **Photo uploader:** a custom Field for upload fields on Players, People, Sponsors, Gallery, News, Events: a drop area with a real preview (thumbnail, filename, size, "Replace" and "Remove"), image-only guidance ("JPG, PNG or WebP, at least 800px wide"), client-side type and size check before upload, progress and error text; uses Payload's existing upload endpoint and `relationship` data (no schema change).
- **Save state:** a `StickyActionBar` replaces the small corner button: primary "Save" (gold), "Saved just now / Unsaved changes / Saving..." line from Payload's `useFormModified` and `useDocumentInfo`, a "Save and publish" wording only where the collection has drafts/status, and a leave-page guard (Payload's own). The "Last modified / Created" metadata moves into Details.
- **People and player pickers with photos:** relationship fields to `players` and `people` (Player sponsors, Squad/selection links where editable, Events hosts) use a `PersonPicker` built on `SearchPicker` showing the photo Avatar, name and a secondary line; it is a Field component over the same relationship value, so no data change.
- Breadcrumb: a text "Back to Players" link, not the tiny crest.

### Data, access, migrations
No schema change (labels, descriptions, admin config and components only). `admin.defaultColumns`, `listSearchableFields`, pagination limits are config. No access change; field-level access stays as is (`syncOwned`, `adminOnlyCondition`). No migration, so no `payload-types.ts` change beyond what `pnpm generate` reports; importMap regenerated and committed (`pnpm check:generated`).

### Tests
Unit: cell components (status words, no raw booleans), placeholder map, `PersonPicker` and photo uploader behaviours (preview, replace, type reject), description length test for committee-facing collections (<= 110 chars; the microcopy test). Int: each changed collection still loads its list and edit page for admin and editor and the field-level access tests stay green (`access` tests untouched, run once at the end). Visual 1440 and 390 before/after for Players list and edit, Sponsors list and edit, Events edit.

### Docs and seed
Update the `admin` field and text of the affected feature docs (`players-directory-and-profiles`, `sponsors`, `events-and-rsvps`, `news`, `announcements`, `gallery`, `committee-and-contacts`, `documents`). Seed:demo: players with photos (generated placeholder images through `sharp`, no downloads), sponsors with logos, a hidden player and a past player so every pill shows.

### Acceptance
The Players list shows photos and pills; search placeholder is plain; no `true`/`false` text; editing a player shows Details collapsed with slug/source inside; Save bar visible at 390 without scrolling; a photo shows its preview before and after saving.

### Risks
Payload edit-view DOM is only partly customisable; where a control (document controls) cannot be replaced, it is restyled and the extra bar is added through documented `edit.beforeDocumentControls`/`actions` slots. Admin-only Advanced collections (Users, aliases, seasons, sync runs, Media) get the kit styling but not bespoke columns.

## 7. WP-5: all remaining custom views, microcopy, accessibility, final gallery

- **Views moved onto the kit** (`AdminShell`, `PageHeader`, `Card`, `Button`, `StatusPill`, `EmptyState`, skeletons): Club office home and its modules (members, fees, volunteers and week, meetings and minutes and actions and documents, email and campaign, diary, stock and stocktake/person/item, strategic plan), Selectors (selection, votes, nets admin as they appear in `SelectorsView`/`SelectorsPanel`), Fantasy, Sign-in settings (`SignInPanel`), Player data tools (history import, duplicates, label renames, merge undo), StatLab tools (admin-facing parts), Approvals, Help. The 1,000+ lines of per-view CSS in `admin.css` collapse onto shared classes; one mechanical pattern, so it is done by one agent sequentially (per CLAUDE.md dispatch efficiency), not fanned out.
- **Microcopy sweep:** every committee-facing string passes `tests/admin-microcopy.test.ts` (banned words list above); error messages say what to do next; empty states always have an action.
- **Accessibility:** one landmark structure (`header`, `nav` labelled "Main", `main`), one h1 per page, labels on every control, `aria-live` for toasts and save state, table captions or `aria-label`s, focus management when dialogs and slide-overs open and close, keyboard operability for SearchPicker, Tabs, Segmented, Disclosure; text contrast >= 4.5:1 and UI contrast >= 3:1 across tokens (unit test) and a manual axe-style pass at 1440 and 390; reduced motion honoured. `web-design-guidelines` review on the changed views.
- **390px pass on every screen**: a checklist file (kept in the scratchpad, not committed) with a screenshot per screen; no horizontal overflow (an automated check via Chrome `scrollWidth <= innerWidth` for each route in the checklist), 44px tap targets.
- **Final before/after gallery** in the scratchpad: one HTML contact sheet pairing the "before" screenshots captured at the start of each WP with the "after", 1440 and 390 for: login, Home, sidebar and mobile menu, Social (make, posts, three style x size), Players list and edit, Sponsors list and edit, Events edit, Club office home, Selectors, Fantasy, Sign-in settings, Player data tools, Help, Waiting for approval.

Data, access, migrations: none. Tests: the microcopy, contrast and navigation tests; per-view smoke render tests (admin and editor, empty and seeded database); existing `admin-visibility`, `access`, `staff-guard`, `feature-docs`, `no-brand-hex` stay green. Docs: update the `admin` blurbs in affected feature docs and the index. Seed: nothing beyond WP-2 to WP-4.

## 8. Cross-cutting

- **Access summary (nothing weakened):** all views stay behind `requireStaff` (admin or editor); admin-only screens keep `isAdminUser`; selectors and anonymous visitors never see these screens or their endpoints; personal and financial data (members, fees, hours, email lists) stay admin-only and are not public over REST (GraphQL is disabled); CSV exports unchanged (admin-only, formula-injection safe). No new public route, no token route, no selector route in this wave. REST/GraphQL surface unchanged except the staff-only social logo endpoint.
- **Migrations:** none planned; if a WP discovers it needs one (a per-user "recent items" preference is explicitly out of scope, stored in `localStorage` only), it must be `pnpm payload migrate:create` schema-qualified with `check:migrations`, `pnpm generate` and `check:generated` passing.
- **Per-WP review gate:** each reviewer looks at before/after screenshots at 1440 and 390 and judges hierarchy, alignment, contrast >= 4.5:1, 44px tap targets, no overflow, no default browser controls in custom views, and club-neutrality (swap the theme colours to a second palette in dev and confirm nothing is wrong, and `no-brand-hex` plus the "no club name in code" guards pass).
- **Ordering and sizing:** WP-0 first (small, independent, release-worthy alone), WP-1 (kit + shell), then WP-2 to WP-4 which depend only on WP-1 and can be done sequentially by one agent each; WP-5 last. Full vitest and one `next build` only at the verify step; targeted checks (tsc, `payload generate:types`/`generate:importmap`, single vitest files, eslint on changed files) while iterating.
- **Local seed for screenshots:** `PAYLOAD_PUSH=false` for migrate, `CLUB_PRESET=lang-lang`, `CANONICAL_HOST=langlangcricketclub.com`, `COOKIE_PREFIX`, `PLAYHQ_TEAM_PREFIX` set, `PLAYHQ_CLIENT_ID=` empty, `--target 127.0.0.1/langlang_dev --confirm`, then `seed:admin`, `seed:club`, `seed:demo`, `fixture:stats`. Dev servers on ports 4500 to 4599. No live external calls: Meta, email, AI gateway and social networks are mocked or off when unset.

## 9. Before/after capture plan
At the start of each WP, capture "before" at 1440 and 390 of the screens it changes; at the end, "after" with the same data and the same viewport. The spec-time captures (1440 only, Home and Social) are listed in section 0.

## 10. Needs an outside decision or credential
- Vercel preview protection and the owner's session on the preview (hosting setting; code cannot fix a 503 from the platform).
- Real Facebook, Instagram and X publishing: needs the clubs' app review and tokens (issue #23); stays an env-gated stub.
- Any new club's crest and palette are entered in the Site look screen; no code change per club.
