# Announce teams: selector accounts, availability, squads, team selection and publishing (design)

Date: 2026-10-05. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #39 (selector accounts and Facebook sign-in), #15 (availability), #16 (squad boards), #17 (team selection), the lineup graphic of #21, and the match-day overview of #20. Out of scope: best-player votes (#18), net sessions and net attendance (#19), the other #21 graphic types, auto-posting to Facebook (#23).

| WP | Issues | One line |
| --- | --- | --- |
| WP-A Selector accounts and Facebook sign-in | #39 | A `selector` role created from the admin, a mobile selector area at `/selector`, "Continue with Facebook" (invite-only) and a password fallback. |
| WP-B Availability and squads | #15 #16 | A no-login availability link with a PIN, an availability matrix, and squad boards per grade. |
| WP-C Selection and announce | #17, #21 (lineup), #20 (overview) | Team sheets per fixture, "Publish teams", a public teams page, an announcement, a themed lineup image and a copy-ready post text. |

Product goal (applies everywhere): this repository is reused for other clubs. Colours, crest, fonts, names, copy, hosts, cookie names and the Facebook app come from the `theme` and `club` globals or env (`config/site.ts`), never from code. Tailwind `brand-*` tokens only, no hex literals, no "Lang Lang" strings outside `config/site.ts` and seed defaults (`tests/no-brand-hex.test.ts` and the club-name guard stay green).

Everything below was checked against this branch (Payload 3.90.2, Next 16.3.8) unless marked **(verify)**. Verify items are listed in Appendix B with how to settle each one.

## 0. Findings that shape the design

1. **`isStaff` means "any logged-in user" today.** `payload/access/index.ts` defines `isStaff = Boolean(req.user)`, and `staffOr`, `isStaffField` do the same. The same assumption is in `payload/collections/News.ts` (line 28), `Yearbooks.ts`, `SavedReports.ts`, `payload/endpoints/mergePlayers.ts` (`!req.user`), `payload/hooks/storyLifecycle.ts` (`submittedByAdmin`), `AdminPage.tsx` and the dashboard. The moment a third role exists, every one of those would grant a selector full committee rights (hidden players, unpublished news, merge players). **First task of WP-A is to make "staff" mean `admin | editor` and not disabled**, and to prove it with a matrix test (section 3.9). This is the highest-risk part of the whole feature.
2. **Payload 3.90.2 cookie name is global.** `generatePayloadCookie` uses `config.cookiePrefix` (`payload-token`), not the collection. A separate `selectors` auth collection would fight over one cookie in the same browser. So selectors are rows in `users` with `role: 'selector'`.
3. **There is no email adapter** (forgot-password is disabled for that reason). Invitations therefore cannot be emailed; they are a copyable link the committee shares by message (section 3.4).
4. **PlayHQ players carry no phone number.** The "last 4 digits of the phone" PIN of #15 needs a private contact store that does not exist (section 4.2).
5. **Upcoming fixtures are not stored.** `matches` holds only FINAL games. Upcoming games come from the PlayHQ live cache (`lib/playhq/queries.ts`, `getClubGames`, TTL 30 min). Availability and team sheets need a durable fixture key, so a small snapshot collection is added (section 4.3).
6. **GraphQL is disabled** (`graphQL: { disable: true }`), so "REST + GraphQL" access below is REST and the Local API only. Public pages use `lib/*-queries.ts`, which state their own visibility filter because the Local API ignores access rules.
7. **Payload 3.90.2 session internals** (verified in `node_modules/payload/dist/auth`): `addSessionToUser`, `getFieldsToSign`, `jwtSign`, `generatePayloadCookie`, `resetLoginAttempts` are exported; `useSessions` is on by default, so a JWT is valid only while its `sid` is in `user.sessions`. That gives us both a way to mint a session without a password (3.5) and a way to revoke one (clear `sessions`).
8. **Facebook (checked against Meta's manual-flow doc, current Graph version shown as v25.0).** Dialog `https://www.facebook.com/<ver>/dialog/oauth` (client_id, redirect_uri, state, response_type=code, scope), token `GET https://graph.facebook.com/<ver>/oauth/access_token` (client_id, redirect_uri, client_secret, code). PKCE is **not documented** for this flow: we send `code_challenge`/`code_verifier` behind a switch and treat state plus a signed cookie as the primary defence (3.5). The data-deletion callback is mandatory for a Live app.

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit paths, no push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. All DB work is local (127.0.0.1:54329; `langlang_dev`, `langlang_test`, `langlang_mig`). No live PlayHQ calls (run anything that could reach PlayHQ with `PLAYHQ_CLIENT_ID=` empty; tests use fixtures/mocks). No real Facebook calls: the OAuth endpoints are an injectable `fetch` in tests. Dev server ports 3900-3999.

**Migrations.** One migration per WP (`pnpm payload migrate:create wp_a_selectors`, `wp_b_availability`, `wp_c_selection`), schema-qualified, `.ts` and `.json` committed; `pnpm generate`, then `git add payload-types.ts "app/(payload)/admin/importMap.js"`; `pnpm check:migrations` and `pnpm check:generated` pass.

**Admin classification.** Every new collection and global gets `admin.group: false`, plain labels and helper text. New third class: **selection collections** (`selectionCollections` in `payload/admin/navigation.ts`): `admin.hidden: true` for every role, managed in the selector area, not editable as raw rows in the admin, REST-writable only by selection users where stated. `tests/admin-visibility.test.ts` is extended to classify them (hidden, anonymous denied) the way it does `internalCollections`. Two real admin entries are added: **Selectors** (everyday, a custom view, section 3.6) and **Selection settings** (advanced global). The everyday cap in the test is 16 and the menu is at 16; **Selectors is truly everyday for the committee (the committee creates the logins), so the cap goes to 17**, with the reason in the test comment. Nothing else is added to the everyday menu: selectors and the committee reach the tools through `/selector`, linked from the Selectors view and one dashboard tile ("Add a selector").

**Personal data.** Phones, PINs, emails, Facebook ids and invite tokens are never public over REST or the Local API as used by pages. Fields use field-level access plus `hidden: true` for secrets (hidden fields are stripped from REST responses for everyone and returned by the Local API only with `showHiddenFields`).

**Mobile first.** Every `/selector` page is designed at 360 px first: single column, 44 px tap targets, sticky bottom action bar, no hover-only controls, no horizontal page scroll (matrix scrolls inside its own container with a sticky name column).

**Docs.** Five feature docs (`selector-accounts`, `availability-link`, `squad-boards`, `team-selection-and-announce`, `match-day-overview`) plus the index; `tests/feature-docs.test.ts` enforces shape. Docs are written when each WP lands, describing only what is built.

## 2. Roles and permissions model (the contract)

Role values on `users.role`: `admin`, `editor`, `selector`. Helpers in `payload/access/index.ts` (all treat `disabled` users as nobody):

| Helper | True for |
| --- | --- |
| `isAdmin` | admin |
| `isStaff` | admin, editor |
| `isSelection` | admin, editor, selector |
| `selectionOr(where)` | selection users see all, others see `where` (rarely used; most selection data has no public read) |
| `staffOr(where)` (existing) | now staff only (was any user) |

The JWT carries `role` (already `saveToJWT`). A custom Payload `access.admin` on `users` returns true only for admin and editor, so a selector who signs in cannot open `/admin` (Payload shows its unauthorised view) and cannot pass any `isStaff` check.

Per-resource access (REST and Local API with `overrideAccess: false`; anonymous is denied everywhere unless stated):

| Resource | read | create | update | delete |
| --- | --- | --- | --- | --- |
| `users` | admin all; editor: self + role selector; selector: self | admin any; editor only role selector (forced, 3.3) | admin any; editor: self (no role) + selectors; selector: self (name, password only) | admin; editor only selectors |
| `player-selection-profiles` (WP-B) | selection | selection | selection (`pinHash` never writable over REST) | admin, editor |
| `selection-fixtures` | selection | nobody (code) | nobody (code) | nobody |
| `availability`, `availability-ranges` | selection | selection | selection | selection |
| `squads`, `squad-members` | selection | selection | selection | selection |
| `team-sheets` | selection | selection | selection (publish fields only through the publish action) | admin, editor |
| `throttle-hits` (internal) | admin | nobody | nobody | nobody |
| `selection-settings` global | selection | n/a | admin (link rotation and enable switch go through an action open to selection) | n/a |
| `announcements` (existing) | public published | staff | staff | staff; the publish action writes with the Local API after its own role check |

Public pages never read these through REST. `/teams` and `/availability/[token]` read through `lib/teams-queries.ts` and `lib/availability-public.ts`, each stating its filter.

## 3. WP-A: Selector accounts and Facebook sign-in (#39)

### 3.1 Schema (migration `wp_a_selectors`)

New `users` fields, all `hidden: true` unless stated, `admin.condition` admin-only so the raw user form stays simple:

- `role` gains option `selector` (label "Selector (picks the teams)").
- `disabled` checkbox (default false), index. Not hidden (shown on the Selectors view).
- `inviteTokenHash` text (SHA-256 hex of a 32-byte random token; the token is high-entropy so a plain SHA-256 is enough), `inviteExpiresAt` date, `invitedAt` date.
- `facebookId` text, **unique index** (partial: `WHERE facebook_id IS NOT NULL`), `facebookLinkedAt` date.
- `lastLoginAt` date, `lastLoginMethod` select (`password`, `facebook`).

Derived status (pure `lib/selector-status.ts`): `disabled`, else `invited` (no login yet and invite window open), else `invite expired` (no login yet, window closed), else `active`. "Facebook linked" is a separate chip.

### 3.2 Making "staff" mean staff (first commit)

1. Rewrite the helpers in section 2; update every caller listed in finding 1 (`News`, `Yearbooks`, `SavedReports`, `mergePlayers`, `storyLifecycle`, `AdminPage`, `Dashboard`, `adminOnly.ts`). Where code asked "is there a user" it now asks the helper.
2. `Users.access.admin` returns `role in (admin, editor) && !disabled`.
3. Collection `beforeLogin` hook throws the same `AuthenticationError` for a disabled user (uniform message, no hint that the account exists).
4. Matrix test (3.9) is written before the other WP-A code and must pass at the end of this commit.

### 3.3 Creating selectors: privilege rules

- `users.access.create`: admin any; editor allowed, but a `beforeValidate` hook **forces** `role = 'selector'` for an editor (the default is `editor`, so omitting `role` must not create an editor), strips `disabled`, `facebookId`, `sessions`, `lockUntil`, `loginAttempts`, `_verified` from editor input, and rejects any other role value with 403 instead of silently coercing (so an escalation attempt is visible in tests).
- `users.access.update`: editor may update self and any `role: selector` row. The `role` field keeps `access.update: isAdminField`, so an editor can never change anyone's role (including their own or a selector's), and a hook rejects a body that tries (403, not silent drop).
- An editor cannot read, update, unlock or delete admins or other editors (`where role = selector`).
- A selector updates only self, only `name` and `password` (field access; hook rejects `email`, `role`, `disabled`, `facebookId`).
- Changing a selector's email clears `facebookId` and sets a fresh invite window (a different email is a different person until proven otherwise).
- Disabling sets `disabled`, clears `sessions` (revokes every cookie at once). It keeps the Facebook link so re-enabling restores access; unlinking is a separate button.
- Deleting an editor-created selector is allowed for editors; deleting any non-selector is admin-only.

### 3.4 The "Add a selector" flow and invitations (admin custom view)

Custom admin view `payload/components/SelectorsView.tsx` at `/selectors` (everyday nav entry "Selectors", visible to admin and editor; same pattern as `ApprovalsView`). Plain English, large buttons:

1. List: name, email, status chip (Invited, Active, Disabled), "Facebook linked" chip, last sign-in.
2. **Add a selector**: two fields, name and email. Creates the user with a random 32-byte password nobody knows (Payload requires one), `inviteTokenHash`, `inviteExpiresAt = now + 14 days` (setting `SELECTOR_INVITE_DAYS`, default 14). The result shows the invite link once with **Copy link** and **Share** (`sms:`/`https://wa.me/?text=` links built client-side; no third-party call) and the sentence "Send this to <name>. It opens the selector tools and lets them sign in with Facebook or choose a password. It works for 14 days."
3. Per row actions: **New invite link** (replaces the token and reopens the window), **Allow Facebook sign-in again** (reopens the binding window without a link), **Unlink Facebook**, **Disable / Enable**, **Set a password** (typed by committee, min 10 chars, for people with no Facebook and no patience), **Remove**.
4. Endpoints in `payload/endpoints/selectors.ts` (`POST /api/selectors/create|invite|unlink|disable|enable|set-password|remove`), each guarded by `refuseNonStaff` (admin or editor, 401/403), each calling the Local API with `overrideAccess: false, user: req.user` so the collection rules of 3.3 are the single source of truth, and each unit-tested for refusal by selector and anonymous.

The invite page `/selector/invite/[token]` (public, noindex, no-store): looks up by `sha256(token)` in constant time against a single indexed row, checks the window, shows "Hi <first name>" and two choices: **Continue with Facebook** (when configured; this starts the flow with the invite carried in the state cookie so the email match is allowed to bind) or **Choose a password** (consumes the token; min 10 chars; then signs in). Wrong or expired token: one generic page ("This link has expired. Ask the committee for a new one."). Throttled per IP (section 4.4).

### 3.5 Facebook sign-in (invite-only OAuth 2.0 authorisation code flow)

Config (`lib/facebook-login.ts`, reads env at call time, no module-scope secrets):

| Env | Meaning |
| --- | --- |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | The club's Meta app. **Either unset: no button, every `/selector/facebook/*` route returns 404**, the login page shows only the password form. |
| `FACEBOOK_GRAPH_VERSION` | Default `v25.0` (**verify** when setting up; versions are retired about two years after release). One constant in `config/site.ts`. |
| `FACEBOOK_PKCE` | `on` (default) or `off`, because Meta does not document PKCE for this flow (Appendix B). |
| `FACEBOOK_REDIRECT_ORIGIN` | Optional override of the origin used to build the redirect URI. |

Redirect URI = `${origin}/selector/facebook/callback`, where `origin` is `FACEBOOK_REDIRECT_ORIGIN`, else `resolveServerURL()` (production: `NEXT_PUBLIC_SERVER_URL`; preview: `https://${VERCEL_BRANCH_URL}`, the stable per-branch alias). Meta requires every URI to be registered exactly, so **only production and one stable preview alias support Facebook sign-in**; any other host shows the password form only (the page checks `host === origin host`).

**Flow**

1. `GET /selector/facebook/start?next=/selector/teams` (optionally `&invite=<token>`). Generates `state` (32 random bytes, base64url), `code_verifier` (43+ chars) and, when PKCE is on, `code_challenge = base64url(sha256(verifier))` with `code_challenge_method=S256`. Stores `{ state, verifier, next, inviteHash?, userId? , iat }` in one cookie `${COOKIE_PREFIX}_sel_oauth`: httpOnly, `SameSite=Lax` (must be sent on the top-level GET back from Facebook), `Secure` in production, `Path=/selector/facebook`, `Max-Age=600`, HMAC-SHA256-signed with a key derived from `PAYLOAD_SECRET` (HKDF, label `selector-oauth`) so cookie tossing from a sibling subdomain cannot plant a state. `next` is accepted only if it starts with `/selector` and contains no `//`, `\`, or scheme (open-redirect guard, unit-tested). Redirects to the dialog with `scope=public_profile,email`, `response_type=code`.
2. `GET /selector/facebook/callback?code&state` (or `error`): response headers `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. Steps in order, each failing to the same friendly page with a specific internal log line: cookie present and signature valid, not older than 10 minutes; `state` equals cookie state (`timingSafeEqual`); **the cookie is cleared immediately (single use, also on every failure)**; `error` param (user pressed Cancel) shows "Facebook sign-in was cancelled".
3. Server-to-server token exchange (`fetch`, 5 s timeout, `client_secret` only here, never to the browser, never logged) then `GET /me?fields=id,name,email` with the access token in the `Authorization` header. The access token is used once and discarded; **we store only the Facebook user id**. (`debug_token` is not needed because the token came straight from our own exchange.)
4. Account resolution, in this order (**never creates a user**):
   a. A selection user with `facebookId = me.id` exists: if `disabled`, fail with the generic "can't sign in" page; else sign in.
   b. Else bind-by-email, allowed only when **all** hold: `me.email` present (Facebook returns it only when the person granted it and has a confirmed address, **verify**); an enabled user with that email (lower-cased, trimmed) has `role = selector` (staff may also bind, harmless) and no `facebookId`; and the account has an open binding window (`inviteExpiresAt` in the future), or the state cookie carries the matching `inviteHash`. On success set `facebookId`, `facebookLinkedAt`, clear `inviteExpiresAt` (window closed).
   c. Else, if the state cookie carries `userId` (the **authenticated link** flow below), bind to that user.
   d. Else fail with one generic page for every non-match reason (no account, no email, window closed, already bound to another id): "That Facebook account is not linked to a selector login. Ask the committee to add you, or sign in with your password and link Facebook from My account." Missing/unverified email gets the more specific hint "Facebook did not share an email address. Allow email access when Facebook asks, or use your password."
5. Mint the session (3.5.1), set the cookie, redirect to `next`.

**Authenticated link flow.** A signed-in selector opens `/selector/account` and presses **Link Facebook**; `/selector/facebook/start?link=1` puts their `userId` in the signed cookie; step 4c binds regardless of email. This is the safest binding because it does not trust the email at all. **Unlink** is available there and in the admin view.

**Login fixation and CSRF protections** (each has a test): state compare and single use; signed, short-lived, path-scoped cookie; the session is always newly created (`addSessionToUser` gives a new `sid`; any prior `payload-token` is overwritten, never reused); the callback never trusts query parameters other than `code` and `state`; `next` allowlist; no auto-creation; per-IP throttle on `/start` and `/callback` (section 4.4); a Facebook id can bind to one user only (unique index); an already-bound user cannot be re-bound by email.

**Data deletion and deauthorise callbacks** (mandatory for a Live app): `POST /selector/facebook/data-deletion` and `/selector/facebook/deauthorize` accept `signed_request`, verify `HMAC-SHA256(app_secret, payload)` in constant time and reject others with 400, then clear `facebookId` for `user_id` (the committee's account stays; only the link goes) and return `{ url: <origin>/selector/facebook/deletion-status?code=<random>, confirmation_code: <random> }`. The status page is static ("The Facebook link has been removed"). Documented as the URL to paste into the Meta console.

#### 3.5.1 Minting a normal session without a password (investigated, verified by a spike test before building on it)

Payload's custom `auth.strategies` only **authenticate an incoming request**; they do not create sessions or cookies, so a strategy alone cannot sign someone in after an OAuth redirect. The cleanest supported mechanism in 3.90.2 uses exported primitives, exactly what `login` does after the password check:

1. `const doc = await payload.db.findOne({ collection: 'users', where: { id: { equals: id } } })` (the raw row, as `login` does; `addSessionToUser` writes the whole object back).
2. `const { sid } = await addSessionToUser({ collectionConfig, payload, req, user: doc })`.
3. `const fields = getFieldsToSign({ collectionConfig, email: doc.email, sid, user: doc })` then `const { token } = await jwtSign({ fieldsToSign: fields, secret: payload.secret, tokenExpiration: collectionConfig.auth.tokenExpiration })`.
4. `generatePayloadCookie({ collectionAuthConfig, cookiePrefix: payload.config.cookiePrefix, token })` into the redirect response.
5. Update `lastLoginAt`, `lastLoginMethod`, call `resetLoginAttempts`.

The result is the same `payload-token` cookie `payload.auth()`, `/api/users/me` and the access functions already understand; logout, `sessions` revocation and `tokenExpiration` (7 days) behave unchanged. **Spike test first** (`tests/int/selector-session.int.test.ts`): mint for a seeded selector, call `payload.auth({ headers })` with that cookie and assert `user.role === 'selector'`; assert that clearing `sessions` makes the same cookie fail; assert `/admin` access is denied. The helper lives in one file (`lib/selector-session.ts`) with a header comment pinning the Payload version, and the test fails loudly on a Payload upgrade that changes it. A custom `auth.strategies` entry is **not** needed. If the spike fails, the fallback is `payload.login` with a per-login random one-time password written to the user, rejected because it would invalidate the password fallback on every Facebook sign-in.

### 3.6 Password fallback and the selector login page

`/selector/login`: **Continue with Facebook** (only when configured) above an email and password form. The form is a server action calling `payload.login({ collection: 'users', data })`, so the existing lockout applies (`maxLoginAttempts` 5, `lockTime` 10 minutes, Payload defaults, now stated explicitly in `Users.auth` so a Payload default change cannot weaken it) and the error is always "Email or password is not right." (uniform, also for disabled or locked accounts). A per-IP throttle (4.4) sits in front. After sign-in, only selection roles continue to `/selector`; the page never reveals whether an email exists. Logout: server action calling `payload.logout`-equivalent (clear cookie and remove the `sid`). Footer link "Selector login" (rendered always; it is just a link) is the only public entry point; `/selector` is `noindex` and disallowed in `robots.ts`.

### 3.7 The selector area shell (WP-A delivers the frame, WP-B and WP-C fill it)

`app/(frontend)/selector/layout.tsx` (dynamic, `robots: noindex`), `requireSelection()` helper in `lib/selector-auth.ts` (`payload.auth({ headers })`, role in selection roles, not disabled, else redirect to `/selector/login?next=`). Pages built later: `/selector` (overview), `/selector/availability`, `/selector/squads`, `/selector/teams`, `/selector/teams/[gameId]`, `/selector/players/[slug]`, `/selector/link`, `/selector/account`. Bottom tab bar on phones (Overview, Availability, Squads, Teams), top bar on desktop, theme colours via `brand-*` classes.

### 3.8 Files

`payload/collections/Users.ts` (edit), `payload/access/index.ts` (edit), `lib/selector-status.ts`, `lib/selector-session.ts`, `lib/selector-auth.ts`, `lib/facebook-login.ts`, `lib/oauth-cookie.ts` (sign/verify, HKDF), `lib/safe-next.ts`, `lib/throttle.ts` (shared with WP-B), `payload/endpoints/selectors.ts`, `payload/components/SelectorsView.tsx`, `app/(frontend)/selector/{login,invite/[token],facebook/{start,callback,data-deletion,deauthorize,deletion-status},account}/…`, `app/(frontend)/selector/layout.tsx`, `robots.ts` (disallow `/selector`), admin copy in `payload/admin/copy.ts`, nav and test edits, `.env.example`, seed.

### 3.9 Tests (WP-A)

Unit (no DB): `safe-next` (open-redirect table), `oauth-cookie` (tamper, expiry, wrong key, path), `facebook-login` (URL builder, version constant, redirect-URI derivation per env, `signed_request` verify good/bad/tampered), `selector-status`, access helpers truth table (admin, editor, selector, disabled, anonymous).

Integration (`tests/int/selector-*.int.test.ts`, Facebook mocked entirely by an injected `fetch`):
- **Privilege escalation**: editor creates a user with `role: admin` (403), with no role (becomes selector), with `role: editor` (403); editor updates own role (403), a selector's role (403), another editor (denied), an admin (denied); editor cannot read admins or editors by REST list or id; selector cannot list users, cannot update own role, email or `disabled`; editor cannot delete an admin; editor cannot `unlock` an admin; mass-assignment of `sessions`, `lockUntil`, `facebookId`, `_verified` is stripped or refused.
- **Selector is not staff (matrix)**: for every collection and global in the config, for REST find/create/update/delete as a selector, result equals the anonymous result except an explicit allowlist (self in `users`, the selection collections and `selection-settings`). Includes hidden players, unpublished news and stories, `merge-players` endpoints, saved-reports, history import, and `/admin` access. Fails if a new collection is added without a decision (same spirit as `admin-visibility`).
- **OAuth**: happy path (id match); email bind with window open; email bind refused with window closed, with no email, with email owned by a user already bound to another id, with an editor-disabled user; never creates a user (count before and after for every failure); state mismatch, missing cookie, expired cookie, replayed state (second callback with same cookie cleared), tampered cookie, `error=access_denied`; PKCE verifier sent in the exchange; `next` allowlist; authenticated-link flow binds regardless of email and refuses a Facebook id already bound elsewhere; data-deletion callback unlinks and rejects a bad signature; routes 404 when env unset; session cookie fixation (callback with a pre-existing `payload-token` for another user replaces it with a fresh `sid` for the right user).
- **Sessions and disable**: disabled user cannot log in (password and Facebook); disabling an active session makes the old cookie fail; password login lockout after 5 bad attempts with the uniform message; invite token single use, expiry, wrong token generic page.

### 3.10 Docs and seed

`docs/features/selector-accounts.mdx` including **How to set up Facebook** (3.11), index row, `committee-admin.mdx` and `users-and-authentication.mdx` updated. Seed (`seed:demo`): two selectors (one password-active, one invited with a printed invite link in the seed log), never a Facebook id.

### 3.11 What the club must do in the Meta developer console (goes into the doc and the cutover checklist)

1. Sign in at developers.facebook.com with the club's Facebook account, **Create app**, use case "Authenticate and request data from users with Facebook Login", app type Consumer/Business (**verify** current wording), name it after the club.
2. Add the **Facebook Login** product (Web). Under Facebook Login settings: **Client OAuth login** on, **Web OAuth login** on, **Enforce HTTPS** on, **Use Strict Mode for redirect URIs** on, and add **Valid OAuth Redirect URIs** exactly: `https://<production host>/selector/facebook/callback` and the stable preview alias used for rehearsal (`https://<branch alias>/selector/facebook/callback`). Leave embedded browser and device login off.
3. App settings > Basic: App domains (the production host), **Privacy Policy URL** (a public page on the club site, create one under Pages if there is none), **User data deletion**: callback URL `https://<production host>/selector/facebook/data-deletion`, app icon, category. Copy **App ID** and **App Secret** into Vercel env `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (secret as Sensitive; never in a preview env pulled locally).
4. Permissions: only `public_profile` and `email`. Both are default permissions available without App Review (**verify**). Ask for nothing else.
5. Set the app to **Live** (toggle at the top; needs the privacy URL and deletion callback). In Development mode only people with a role on the app (admins, developers, testers) can sign in, which is useful for the rehearsal: add the two or three rehearsal selectors as **Testers**.
6. Business verification is **not** needed for these two default permissions (**verify**; Meta changes this).
7. Smoke test: Add a selector in the admin, open the invite link on a phone, tap Continue with Facebook, approve, land on `/selector`. Then unlink in the admin and confirm the same Facebook account is refused.
8. Annually: check Meta's Graph API version deprecation notice and bump `FACEBOOK_GRAPH_VERSION`.

Cutover checklist (`docs/superpowers/plans/2026-10-03-payload-cutover-checklist.md`): add `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (optional, button hidden if unset), `FACEBOOK_GRAPH_VERSION`, `SELECTOR_INVITE_DAYS` to A.2, a new A.5 "Facebook app" list with the console steps above, and a smoke-list row "Selector can sign in with password and (if configured) Facebook; a non-invited Facebook account is refused".

### 3.12 Acceptance checks (local, no Facebook)

`pnpm vitest run tests/<each new unit file>`, then the selector int files one at a time; `pnpm tsc --noEmit`. By hand: dev server on 39xx, `seed:demo`, admin as editor: **Selectors > Add a selector** creates a login and shows a link; open it in a private window, choose a password, land on `/selector`; `/admin` as that selector shows no access; `GET /api/users` as that selector returns only self; `/selector/login` shows no Facebook button with env unset and `/selector/facebook/start` is 404. With a fake Facebook env (dummy id/secret) and the test double used by the int tests, the button appears and the start redirect URL has the expected parameters (no network call is made until the callback).

## 4. WP-B: Availability and squads (#15 #16)

### 4.1 Overview

Players answer in / maybe / out per fixture from one club link with a PIN, no account. Selectors see a players-by-fixtures matrix and set answers for people (phone calls). Squad boards hold who is in each grade squad.

### 4.2 Where private contact data lives

New collection `player-selection-profiles` (selection class, hidden in admin), one row per player (`player` unique relationship):

- `phone` text, normalised to digits (national format validated by a pure `normalisePhone()` using `CLUB_LOCALE`/country config; never logged; **readable and writable by selection users only**, never by anonymous, never on any public query).
- `pinHash` text (hidden, field access nobody for REST), `pinSalt`, `pinSource` (`phone` | `manual`), `pinSetAt`.
- `role` select (`batter`, `bowler`, `all-rounder`, `keeper`, empty = unknown), `canKeep` checkbox, `battingStyle`, `bowlingStyle` text (these feed WP-C; they are selector opinions, not stats), `notes` textarea (private).

How data gets in: (a) selectors type a phone on the player card (`/selector/players/[slug]`) or the matrix "add phone"; (b) bulk: admin **Player data tools** gains a "Contacts CSV" import (`name,phone` or `playerSlug,phone`), reusing the W2 CSV parser, name matching (`player-aliases`, `nameKey`) and its dry-run-then-confirm and undo-by-batch pattern; unmatched and ambiguous rows are reported, never guessed; the file is never stored. Phones are not added to `players`, `player-seasons` or any export (`statlab` CSV, history export): a test greps the export column sets.

PIN design: default PIN is the last 4 digits of the phone (the issue's rule); selectors can set a manual PIN (4 to 6 digits) for players with no phone and tell the player. Storage: `scrypt` (Node `crypto`, no new dependency) over `pepper + pin` where the pepper is derived from `PAYLOAD_SECRET` (HKDF), per-row salt, constant-time compare. Honest limit: a 4-digit PIN has 10,000 values, so an attacker with a stolen database but no secret cannot test guesses (pepper), and an online attacker is stopped by the lockout below; a leak of both is out of scope. PINs are never shown after setting except once to the selector who set a manual one.

### 4.3 Fixtures source and what is stored

New selection collection `selection-fixtures`, one row per PlayHQ game of the club's senior teams: `gameId` (unique), `gradeId`, `gradeName`, `clubTeamId`, `clubTeamName`, `roundName`, `localDate`, `localTime`, `startsAt`, `venueName`, `venueSuburb`, `opponentName`, `isHome`, `status` (`upcoming`, `final`, `removed`), `syncedAt`.

Why stored: availability and sheets need a stable key that survives a PlayHQ outage or a cache expiry, public `/teams` must not call PlayHQ per request, and a rescheduled game must keep its responses. Refresh: `refreshSelectionFixtures()` in `lib/selection-fixtures.ts` reads `getClubGames` for the current season (the same cached path `/fixtures` uses), upserts by `gameId` (never deletes: a game that disappears from PlayHQ becomes `removed`, its availability and sheet stay and the sheet shows "This game has been removed or moved on PlayHQ"), and keeps only games from 14 days ago to 120 days ahead. Triggers: appended to the existing nightly `players-sync` cron, and a **Refresh fixtures** button in the selector area (throttled 1 per 5 minutes per user through `throttle-hits`). Tests use the existing PlayHQ fixtures; scripts run with `PLAYHQ_CLIENT_ID=`. Juniors are excluded using `isJuniorGrade`.

### 4.4 Brute-force protection that works on serverless

No in-memory counters (every invocation may be a fresh instance). `lib/throttle.ts` over an internal collection `throttle-hits` (`key` unique hashed string, `count`, `windowStart`, `lockedUntil`, `strikes`), written with one atomic SQL statement through `payload.db.drizzle` (`INSERT … ON CONFLICT (key) DO UPDATE …`) so concurrent requests cannot both read the old count. API: `hit(key, { limit, windowMs, lockMs })` returns `{ allowed, retryAfter }`; `fail(key, …)`/`clear(key)` for credential keys. Backoff: after `limit` failures lock for `lockMs`, doubling per further strike up to 24 h.

Keys (all hashed with the server pepper so the table holds no names or IPs):
- `avail:link:<linkVersion>:<normalised name>`: **per link and per claimed player**, 5 failures then 15 min lock, doubling. Applied to every attempt including names that do not exist, so unknown and known names behave identically.
- `avail:ip:<ip>`: best effort (`x-real-ip` / `x-vercel-forwarded-for`, else the first `x-forwarded-for` hop; spoofable off Vercel, so it is a second layer, not the main one): 30 attempts per 10 minutes.
- `avail:link:<linkVersion>:all`: 300 failed attempts per hour on a link trips a **global pause** of 15 minutes and writes a notice for the selector overview ("Someone is guessing PINs on the availability link. Consider rotating it.").
- `sel-login:ip:<ip>`, `sel-oauth:ip:<ip>`, `sel-invite:ip:<ip>`: 20 per 10 minutes each.
Nightly cleanup deletes rows idle for 2 days (added to the cron). Lock responses are uniform: "Too many tries. Please try again later or ask a selector." with no indication of which key tripped.

### 4.5 The no-login availability link and the identification flow

`/availability/[token]` (public, `noindex`, no-store, disallowed in robots). The token is a **secret deterministic value**: `base64url(HMAC-SHA256(PAYLOAD_SECRET, 'avail-link:' + linkVersion))`, 43 characters. It is never stored, so a database leak does not reveal it; the server can always re-display it to selectors; **rotate = increment `selection-settings.linkVersion`**, which instantly invalidates the old link, every remembered device and every lock key. Compared with `timingSafeEqual`; wrong token returns a plain 404 page (no hint). `selection-settings.linkEnabled` switches the link off (404 for all).

Identification, chosen for safety and usability: **no list of players is ever shown or returned before authentication.** The page asks **name** (free text, "as on PlayHQ") and **PIN**. The server normalises the name (`normaliseName`, same key as `player-aliases`), looks up players on the current roster (members of any current squad, plus any player with a profile), derives candidates, and verifies the PIN against each candidate with a dummy hash when there is none (equal timing). Wrong name, wrong PIN, no PIN set, ambiguous (two players share name and PIN) and locked all return the same message ("We could not match those details."), plus the lock message only when throttled. Ambiguity creates a notice for selectors ("PIN clash between two players called <name>", resolved by setting a manual PIN). On success the server sets a signed httpOnly cookie `${COOKIE_PREFIX}_avail` (`{ playerId, linkVersion, iat }`, 90 days, HMAC, SameSite=Lax) so the next visit needs no PIN; "Not you? Switch" clears it. One identity per device (families re-identify), simple and safe.

After identification the player sees **only their own** answers and the club's upcoming fixtures for their squad grade(s) (public information already on `/fixtures`): three big buttons per fixture (**In**, **Maybe**, **Out**), an optional 140-character note, and **I'm away from … to …** (a date range, 3.6). They cannot see other players, the squad, selections or anyone's phone. Changes are accepted until a configurable cutoff (`availabilityLockHours`, default 0 = always) after which the page says "Selection has started; call a selector". Responses are written by a server action that re-reads the cookie and recomputes everything from the player id in the signed cookie, never from form fields.

### 4.6 Availability data and ranges

- `availability`: `player`, `fixture` (relationship to `selection-fixtures`), `status` (`in`, `maybe`, `out`), `note`, `source` (`player` | `selector`), `setBy` (user, selector writes only), `respondedAt`. Unique `(player, fixture)`.
- `availability-ranges`: `player`, `from`, `to` (dates, inclusive), `status` (`out` or `maybe`), `note`, `source`, `setBy`. Overlaps allowed.
- Effective answer (pure `lib/availability.ts` `effectiveAvailability(rows, ranges, fixture)`): an explicit `availability` row beats a range; a range covers a fixture whose `localDate` is inside it (so ranges also cover games PlayHQ publishes later); else "no reply". Setting a range from the UI writes the range, not N rows; setting one fixture inside a range writes an override row.

### 4.7 Selector matrix and the QR code

`/selector/availability`: phones show one fixture at a time (tab strip by fixture, list of players with a three-way segmented control and a tap-to-call link when a phone exists); wider screens show the players-by-fixtures matrix (sticky name column, horizontal scroll inside the container, coloured and labelled cells, never colour alone). Filters: grade, "no reply only". Tally per fixture (in / maybe / out / no reply). Selector can set one cell or a range for a player.

`/selector/link` shows the link, a **Copy link** button, the **QR code**, **Rotate link** (confirm dialog explaining that everyone must use the new link and the old one stops at once) and the **Switch off** toggle. QR: generated server-side as an SVG string with the small MIT `qrcode` package (`QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })`), inlined with `currentColor` fills (no external service, no raster); a "Download SVG" link and a print stylesheet for the clubroom noticeboard. New dependency: `qrcode` (+ `@types/qrcode`), recorded in the PR.

### 4.8 Squad boards (#16)

Collections: `squads` (`seasonStartYear`, `gradeId`, `gradeName`, unique `(seasonStartYear, gradeId)`) and `squad-members` (`squad`, `player`, `addedBy`, `addedAt`, unique `(squad, player)`). One row per membership so two selectors moving different players never overwrite each other; a player may be in two squads (fill-in), shown with an "also in B Grade" badge.

`/selector/squads`: a tab per grade (phone: one grade at a time). Each player card shows name, role chip (profile), games this season, **availability dots** for the next three fixtures (green in, amber maybe, red out, grey no reply, with text labels for accessibility), and a recency tag. Moving a player: **drag and drop** with `@dnd-kit/core` and `@dnd-kit/sortable` (pointer, **touch with a long-press activator**, and **keyboard sensor** with announced instructions), **plus a non-drag alternative that is the primary one on phones**: each card has a **Move…** button opening a bottom sheet listing grades (tap one to move or add) and **Remove**. Bulk add: "Add players" sheet with search and recency filters (played this season, played last season, played in the last N years via `player-seasons`, never played), multi-select, add to the current grade. **Auto-seed**: "Start from last season" builds each grade's squad from `player-seasons` rows with `seasonOrder` of the previous season and `games > 0`, grouped by normalised grade name (reusing the W2 grade-label overrides so a renamed grade still matches), shown as a preview the selector confirms; never overwrites existing members. Dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (MIT).

### 4.9 Tests (WP-B)

Unit: `normalisePhone`, `pin` (hash/verify/uniform timing shape, last-4 derivation, peppers differ), `effectiveAvailability` (override beats range, range edges inclusive, later-published fixtures covered), link token derive/compare and rotation, `throttle` backoff arithmetic, QR output starts with `<svg`, auto-seed grouping, recency filters, fixture upsert planner (new, moved, removed, kept).

Integration: link disabled/rotated/wrong token all 404 and old cookies die after rotation; **lockout**: 5 wrong PINs for a real name then the correct PIN is refused (locked), a nonexistent name locks identically and returns the same body, concurrent parallel attempts (Promise.all of 20) cannot exceed the limit (atomic upsert), per-IP limit, global pause, lock expiry and doubling, uniform error bodies byte-identical; no player list or count leaks (response snapshots); responses written only for the cookie's player (form-tampered `playerId` ignored); phone and PIN never appear in any public query result, REST as anonymous, or the history/StatLab export columns; `player-selection-profiles` REST denied to anonymous, allowed to selector, `pinHash` absent from every response; matrix and squad REST allowed to selectors and denied to anonymous; contacts CSV import dry run, confirm, undo, unmatched report; squad move atomicity (two parallel moves, no lost update); fixture refresh with mocked PlayHQ (no network).

### 4.10 Docs and seed

`docs/features/availability-link.mdx` (link, QR, PIN, rotating, privacy statement) and `docs/features/squad-boards.mdx`. Seed: roster squads from the demo players, phones that are obviously fake (`0400 000 0NN`), a few availability rows and one range, link enabled (the demo link printed in the seed log).

### 4.11 Acceptance (local)

Seed, sign in as the demo selector, open `/selector/link`, scan or open the printed link in a private window, identify as a demo player with their PIN, mark In/Out, see it in the matrix; five wrong PINs lock; rotate the link and confirm the old URL is 404 and the private window is asked for the PIN again; on a 360 px viewport check the squad Move sheet and keyboard dragging (Space, arrows, Space).

## 5. WP-C: Selection and announce (#17, lineup of #21, overview of #20)

### 5.1 Team sheet data

Selection collection `team-sheets`, one per fixture (`fixture` unique): `slots` (array of `{ player (rel, optional), guestName (text, optional), order (1-based), isCaptain, isKeeper }`, exactly one of `player` or `guestName`), `size` (`11`, `12`, `13`, `0` for open; default from `selection-settings.defaultXiSize`), `markedReady` (checkbox), `notes` (private), `revision` (int, increments on every save), `updatedBy`, `publishedSnapshot` (json, hidden: `{ revision, publishedAt, size, slots: [{ playerId | guestName, order, isCaptain, isKeeper }] }`), `publishedAt`, `publishedBy`, `publishCount`, `announcementId`. REST cannot write `publishedSnapshot`, `publishedAt`, `publishedBy`, `publishCount`, `announcementId` (field access nobody; only the publish action writes them with the Local API after a role check).

**Concurrency**: saves carry `expectedRevision`; a `beforeChange` hook rejects a stale save with 409 "Someone else changed this team. Reload to see their changes." Nothing silently overwrites another selector.

Derived status per sheet (pure `lib/team-status.ts`): **Not started** (no slots), **In progress** (some slots, not marked ready or short of `size`), **Ready** (marked ready, slots meet size, a captain, a keeper, no blocking warning), **Needs attention** (any warning below). Published is a separate chip ("Published", "Published, changes not published").

### 5.2 Balance, warnings and form (pure, `lib/selection/`)

Roles per player: stored `role` if set, else suggested from data (keeper if `canKeep` or any `keeperCatches/stumpings` in `match-fielding`; bowler if `bowlBalls` ≥ 120 in the last two seasons of `player-seasons` and batting average low; batter if `bowlBalls` < 30; all-rounder when both; else "unknown"). Counts: batters, bowlers (bowler + all-rounder), keepers, unknown. Warnings (plain text, never blocking publish except where noted): no keeper (`keeper` tag missing), no captain, fewer than 5 bowling options, fewer than 5 batters, an unknown-role player count above 3 ("roles missing, balance is a guess"), a selected player marked **out** (or in a range) for that fixture (**strong**), selected in another grade's XI the same day, selected player hidden or removed, fewer slots than `size`, game removed or rescheduled since last save. Warnings recompute on every render from the same functions the server uses at publish time.

**Form read** (honest, documented in the doc, shown as a dot plus numbers, never a bare colour): sample = the player's last 5 club-side appearances in stored `match-batting`/`match-bowling` rows (`match-appearances.player`, `matches.status = final`, newest first, within 400 days; fill-in rows with no player link are excluded).
- Batting trend = recent runs per dismissal (runs ÷ max(1, innings − not-outs)) divided by the player's baseline (all stored rows for that player). Needs at least 3 recent innings **and** at least 8 baseline innings, else **No trend** (only the raw last-5 string is shown, e.g. "23, 4, 51*, 0, 12"). Hot ≥ 1.25, Steady 0.75 to 1.25, Cold < 0.75.
- Bowling trend = recent wickets per innings bowled, compared the same way, with the same minimums (3 and 8 bowled innings). Raw last-5 shown as "2/31, 0/22, …".
- Players without enough stored rows show **No data**, never zero. The doc states the stored match window (rows exist only from the PlayHQ backfill window; older seasons come only from season totals and are not used for trend) and that form is a prompt for the selector, not a verdict.
- Sources are read-only existing queries (`lib/match-store`), cached under the existing `MATCH_STORE_TAG`.

### 5.3 The builder (`/selector/teams/[gameId]`) and all-teams view

Phone-first single column: header (grade, opponent, date, venue, size picker, status chip, warnings list at the top), the **batting order** as a numbered list (drag handle via dnd-kit with touch long-press and keyboard sensor, plus **Up / Down / Remove** buttons per row and a number field to jump to a position, so nothing depends on dragging), tags (**C**, **WK**) as toggles, and an **Add players** bottom sheet listing the grade's squad grouped Available / Maybe / No reply / Out (outs greyed with a confirm), each with role chip, form dot, last-5 string and availability. Sticky action bar: **Autofill**, **Copy last week's side**, **Mark ready**, **Publish teams**.
- **Autofill** (pure, deterministic, tested): candidates = squad members with `in`, then `maybe`, never `out`, not already in another XI the same day; rank by form index (steady when no data), then games this season; fill to `size`; order by each player's mean historical batting position from `match-batting.position` (fallback by role: batters, all-rounders, keeper, bowlers); keeper tag to the player with `canKeep` or most keeper dismissals; captain left to the selector (last captain of that grade pre-selected if still in). It only fills empty slots and shows a preview diff before applying.
- **Copy last week's side**: most recent earlier sheet for the same grade (published or draft); players now `out`, hidden or missing are dropped and listed.
- **All-teams view** (`/selector/teams`): the weekend (next fixture date by default, tabs for later weekends), one card per grade with status chip, XI with tags, warning count and last-edited-by; "Not started" cards link straight into the builder; **Publish all ready** button.

### 5.4 Announce: the Publish action

Server action `publishTeams({ gameIds, announce })` in `app/(frontend)/selector/actions.ts`: re-checks `isSelection`, re-validates each sheet with the same pure functions (blocks only on: no slots, slot count above a fixed `size`, a player who is hidden or missing; everything else is a warning shown on the confirm dialog with a "Publish anyway" tick), then for each sheet in a transaction writes `publishedSnapshot`, `publishedAt`, `publishedBy`, `publishCount + 1`.
1. **Public teams page.** `/teams` (the weekend's published XIs per grade) and `/teams/[gameId]` (one game). Reads only `publishedSnapshot` (so edits stay private until **Publish changes**), resolves names at render with the visibility filter (`hidden = false`), uses `displayName` exactly as player pages do, links names to `/players/[slug]`. A hidden player in a published snapshot is shown as "Player name withheld" in their slot so batting positions stay honest. Batting order is **public by default** (numbered); `selection-settings.publishBattingOrder = false` shows the XI alphabetically without numbers (captain and keeper tags stay). Draft or unpublished sheets are never selected, never in REST (no public REST at all) and never in the sitemap. `Cache-Control` s-maxage 300 plus tag `teams`.
2. **Site announcement (optional, default on via `announceOnPublish`).** Upserts one announcement per weekend keyed by a hidden `autoKey` (`teams:<weekend start date>`): title "Teams for Saturday 12 October", body a plain list (grade, opponent, time, a one-line XI), published = true. Adds an optional `link` field (relative path or https URL) and `linkLabel` to `announcements` (migration `wp_c_selection`; the banner shows a button when set; **verify** `components/announcement-banner.tsx` copes) pointing at `/teams`. Existing announcements and the banner dismissal cookie (`llcc_ann_dismissed` stores the numeric id) are unaffected; a re-announce keeps the same id, so someone who dismissed it does not see it again, and the title gains "(updated)" only when the XI changed, which is acceptable and noted in Risks.
3. **Share material.** `generateMetadata` on `/teams` and `/teams/[gameId]` sets title, description (the plain-text lineup, truncated) and `openGraph.images` / `twitter.images` to the lineup image. **Lineup image route** `/teams/[gameId]/lineup-image` (public only for published sheets, 404 otherwise, so Facebook's crawler can fetch it): `themedImageResponse()` from `lib/theme/og.tsx` (resolves the theme, loads the bundled fonts and the crest chain), `fontFamily 'Display'/'Body'`, colours from `ctx.theme.colors` only. Sizes `1200x630` (default, link preview) and `?format=feed` `1080x1350` (portrait post); shows crest, club short name, "Round 5 v Nar Nar Goon", date, venue, the numbered XI with C and WK badges, and an optional sponsor strip (up to 4 logos from `sponsors`, fetched with the same 2 s timeout and drawable-type guard as `loadCrest`, silently skipped on failure; switch `showSponsorStrip`). Long names are truncated by width; 13 names fit the feed layout. Draft preview for selectors: `/selector/teams/[gameId]/preview-image` (auth-gated, draft allowed). **Download** button uses `?download=1` (`Content-Disposition: attachment; filename="<EXPORT_FILENAME_PREFIX>-<grade>-<date>.png"`). Route added to `outputFileTracingIncludes` in `next.config.ts` (fonts and crest) as the W1 pattern requires. **Copy post text**: pure `lineupText(sheet, fixture, club)` returns, for example, "B Grade v Nar Nar Goon, Sat 12 Oct, 1:00pm, <venue>\n1. A Smith (c)\n2. …\n8. J Jones (wk)\nGood luck team! <site URL>/teams" with club name and URL from config; prefixed "UPDATED: " on a re-publish; a client Copy button using `navigator.clipboard` with a visible text area fallback.
4. **Sitemap, robots, cache.** `/teams` added to the static sitemap list (priority 0.5); `/teams/[gameId]` for published, non-removed fixtures of the last 60 days; `robots.ts` keeps `/selector` and `/availability/` disallowed and allows `/teams/*/lineup-image` explicitly (like `/api/public/players/`). Publishing calls `revalidatePaths(['/', '/teams', '/teams/<id>', '/announcements', '/sitemap.xml'], …, ['teams'])`.
5. **Changing a published sheet.** The selector sees a **Published, changes not published** chip and a diff (in, out, order moved, tag changed). **Publish changes** (re-announce) writes a new snapshot, sets `publishCount > 1`, the public page shows "Updated <time>" and the lineup image a small "UPDATED" tag; the announcement is updated in place with "(updated)" and a one-line change list in the body; the post text is prefixed. **Withdraw** clears the snapshot (page and image 404) and unpublishes the announcement if no other sheet that weekend is published.

### 5.5 Match-day overview (#20, `/selector` home)

Per fixture date, per grade: counts in / maybe / out / no reply; **Who has not replied** (names with a tap-to-call link when a phone exists, plus "Copy a reminder text"); **missing keeper** (no keeper tagged in the sheet, or no available player with `canKeep`), **selection not started**, sheet status chip, and unresolved notices (PIN clash, guessing on the link). Player card `/selector/players/[slug]` (the part of #20 that WP-B/C need): role, styles, last-5 form strings and trend, availability for the next month (effective availability per fixture), phone tap-to-call, notes, link to the public profile. Net attendance is out of scope (#19).

### 5.6 Tests (WP-C)

Unit: role suggestion; balance counts; every warning rule (table); status derivation; form formula with minimums (3 / 8), no-data cases, not-outs, fill-ins excluded, window; autofill determinism, never picks `out`, respects another XI the same day, preview diff; copy-last-week drops unavailable; `lineupText` (updated prefix, club name from config, long names); open-redirect/`next` reuse; snapshot diff; weekend grouping across midnight in `CLUB_TIMEZONE`; sitemap includes only published.

Integration: **publish privacy** (draft sheet and unpublished edits absent from `/teams` queries and anonymous REST; hidden player never named; withdraw 404s page and image; changing a published sheet leaves the public snapshot until re-publish); concurrency (stale `expectedRevision` is a 409, two selectors editing different grades do not collide); publish writes snapshot and announcement upsert idempotently (publish twice = one announcement); re-publish marks updated; selectors cannot write publish fields over REST; image route 404 for drafts, 200 `image/png` for published with the theme colours (resolve from a test theme, no hex literals), cached headers; overview counts match fixtures with ranges and overrides; `no-brand-hex` and the club-name guard pass on all new files.

### 5.7 Docs and seed

`docs/features/team-selection-and-announce.mdx` (builder, form formula, warnings, publishing, sharing, the privacy rules, the weekend workflow) and `docs/features/match-day-overview.mdx`; update `announcements.mdx` (link button), `seo.mdx` (/teams), `club-and-site-settings.mdx` or a new section for **Selection settings**, `docs/features/index.mdx` (new section "For selectors"). Seed (`seed:demo`): a demo season of squads, availability for the next three fixtures, one published sheet and one draft, one "needs attention" sheet (selected player out), form data from the seeded match store.

### 5.8 Acceptance (local)

Demo seed; as the demo selector on a 360 px viewport: open the weekend all-teams view, autofill a grade, reorder with Up/Down and by keyboard, mark ready, Publish teams; open `/teams` in a private window and see the XI (no draft, no hidden player); open `/teams/<id>/lineup-image` and the `?format=feed` variant (visual check of crest, colours, font, tags, long names); Copy post text; check the announcement banner on `/`; edit the sheet, see "changes not published", re-publish, see "Updated" and the same announcement id; withdraw and confirm 404s; `curl -I` the image with a Facebook crawler user agent (`facebookexternalhit/1.1`) and confirm 200 and `image/png`.

## 6. Cross-cutting

**Order of work.** WP-A in this order: (1) access helper rewrite plus matrix test, (2) users fields and migration, (3) editor/selector rules and escalation tests, (4) selectors admin view and invite flow, (5) session mint spike, (6) password login page, (7) Facebook flow, (8) docs and checklist. WP-B: throttle and PIN primitives, collections and migration, fixtures refresh, link and identification, matrix, QR, squads, contacts import, docs. WP-C: pure libs with tests, collections and migration, builder, overview, publish, public pages, image route, sitemap and robots, docs. Commit per step with explicit paths.

**New dependencies (all MIT, recorded in the PR):** `qrcode` (+ types), `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. No Facebook SDK: the flow is plain `fetch`.

**Config additions.** `config/site.ts`: `FACEBOOK_GRAPH_VERSION`, `SELECTOR_INVITE_DAYS`, `selectorPaths` constants; `.env.example` documents `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_VERSION`, `FACEBOOK_PKCE`, `FACEBOOK_REDIRECT_ORIGIN`, `SELECTOR_INVITE_DAYS`. Cookie names use `COOKIE_PREFIX` (`_sel_oauth`, `_avail`). Copy for the admin lives in `payload/admin/copy.ts`; public copy in the pages themselves with club names read from `getClub()`.

**Final Verify step (once, at the end):** `pnpm generate` and `check:generated`, `check:migrations`, `pnpm lint`, `pnpm tsc --noEmit`, the full vitest suite (one run at a time), one `pnpm build`, then the acceptance lists above on port 39xx.

## Appendix A. Decisions worth challenging

1. Selectors live in `users` (shared cookie) rather than a separate collection; the cost is the helper rewrite of section 3.2, the gain is one login, one lockout and one cookie.
2. Email-match binding is allowed only inside an open invite window, never on email alone, and the authenticated "Link Facebook" flow is preferred. A stricter club could set the window to 0 days and use only the authenticated link.
3. The availability link token is derived, not stored, so it can be shown again without a secret column. Rotation is a version bump.
4. Name plus PIN instead of picking from a list. It costs a little typing and removes the roster-enumeration oracle.
5. Phones are visible to every selector. Convenient for chasing no-replies, but a wider audience than "committee only"; a club can restrict to editors by flipping one access function (documented).
6. Public teams page shows the batting order by default; a setting hides it.
7. Everyday admin cap goes from 16 to 17 for **Selectors** only.
8. No email invitations (no adapter). If an email adapter is added later, the invite link can be sent from the same endpoint (new issue under #38 when created).

## Appendix B. Verify list (settle during implementation, in this order)

1. **Session mint** works as in 3.5.1 on 3.90.2 (spike test); also that `addSessionToUser` tolerates the raw DB row and that clearing `sessions` invalidates a JWT.
2. A disabled user's existing cookie stops working after `sessions` is cleared and the `beforeLogin` refusal; whether `access.admin` false is enough to block every `/admin` route (not just the dashboard).
3. Whether a collection with `admin.hidden: true` blocks direct URLs for editors (decides whether the SelectorsView must call endpoints rather than link to `/collections/users`).
4. Facebook: that `email` is only returned when confirmed; whether Meta ignores or rejects `code_challenge`/`code_verifier` on the web flow (hence `FACEBOOK_PKCE`); the current Graph version and the exact Login settings labels; whether business verification is required for the two default permissions; the deletion callback response shape.
5. `components/announcement-banner.tsx` and the announcements page handle the new `link` field without layout change.
6. Earliest date covered by the stored match rows (decides the wording of the form "window" in the docs).
7. The existing grade-label helper for matching `player-seasons.gradeName` to `selection-fixtures.gradeName` in auto-seed.
8. Vercel client IP header available on Hobby/Pro for the per-IP throttle (`x-real-ip`).

## Appendix C. Risks

- **Privilege escalation through the role change** is the main danger: mitigated by the helper rewrite, 403-not-silent-drop on forbidden fields, the matrix test and the review gate that nothing else uses `Boolean(req.user)`.
- **PIN strength.** Four digits is weak by nature; the pepper, per-player and per-link lockouts, the global pause and rotation are the real controls, and the docs say so. Clubs worried about this can use manual 6-digit PINs.
- **Facebook app review and Live mode** are outside our control; the password path means the feature never blocks on Meta. The binding window is short and visible in the admin.
- **Phone numbers** are personal information (Australian Privacy Act, and under-18s with a parent's number): collected for selection only, never public, never exported, removable per player; the doc includes a one-paragraph notice the club can show at registration.
- **Announcement re-use** after a dismissal means a re-published team does not re-show the banner to someone who dismissed it. Accepted; the `/teams` page always shows "Updated".
- **Image route cost.** Satori rendering with remote sponsor logos can be slow; logos are optional, timeboxed, and the response is CDN-cached with tag revalidation.
- **Serverless write races** on selection data: single-row memberships, revision checks and atomic throttle upserts are used instead of array writes.
- **Fixture drift** between PlayHQ and the stored snapshot: refreshed nightly and on demand, `removed` instead of delete, warning on affected sheets.
