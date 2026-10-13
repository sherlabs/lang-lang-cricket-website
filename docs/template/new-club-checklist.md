# New club checklist

Work through this in order. Every step has a check at the end so you know it worked. Nothing here needs a code change.

## 1. Make your copy of the repository

- Create a repository from this template (or fork it) and keep an `upstream` remote: `git remote add upstream <template repository url>`. See [upstream updates](./upstream-updates.md).
- Copy `clubs/example-fc/` to `clubs/<your-slug>/` and edit `profile.json` ([field reference](./club-profile.md)). Add your crest, hero picture, share image and favicon under `clubs/<your-slug>/assets/`.
- In your copy, delete the Lang Lang files under `public/assets/documents`, `public/assets/gallery` and `public/assets/sponsors` and replace `public/favicon.ico`, `public/apple-touch-icon.png`, `public/og-image.jpg` and `public/assets/branding/*`. `pnpm check:template` lists any file that is still one of Lang Lang's.

## 2. Create the hosting

- A Vercel project from the repository, with `pnpm vercel-build` as the build command (already set in `vercel.json`).
- A Postgres database (use the pooled URL for `DATABASE_URI` and the direct URL for `DATABASE_URI_UNPOOLED`) and a Blob store.
- A domain and DNS. Point the apex domain at the project and add the `www` redirect (`REDIRECT_HOSTS`).

## 3. Environment variables

Set these for **Production and Preview**. Run `pnpm check:template` with them in your shell to see what is set, missing or invalid (it never prints a value). `pnpm bootstrap:club` also writes `clubs/<slug>/env-checklist.md` with the same list and its current status.

| Variable | Group | Need | What it does | Read in | When unset |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URI` | Database and secrets | Required | Postgres connection string (pooled on Vercel). | `payload.config.ts` | none |
| `DATABASE_URI_UNPOOLED` | Database and secrets | Required | Direct (not pooled) Postgres URL used to run migrations during the build. | `scripts/vercel-build.mjs` | none |
| `PAYLOAD_SECRET` | Database and secrets | Required | Random secret (32 or more characters) that signs sessions and links. | `payload.config.ts, lib/secrets.ts` | none |
| `PROD_DATABASE_HOST` | Database and secrets | Required | The production database host name (not a secret); the build refuses to deploy when it is empty. | `scripts/vercel-build.mjs` | none |
| `CRON_SECRET` | Database and secrets | Required | Shared secret the scheduled jobs present to the cron routes. | `app/api/cron/*` | none |
| `BLOB_READ_WRITE_TOKEN` | Database and secrets | Required | Vercel Blob token for uploaded files (set by the Blob store on Vercel; never set locally). | `payload.config.ts, payload/env.ts` | files go to ./media |
| `NEXT_PUBLIC_SERVER_URL` | Database and secrets | Optional | The public https address of the site (for example https://riverbend-cc.example). Admin links and email links use it; previews derive it from the Vercel branch URL. | `payload.config.ts, payload/env.ts` | none (set it for production; previews derive it) |
| `TRUSTED_IP_HEADER` | Database and secrets | Optional | Only when not hosting on Vercel: the header your reverse proxy overwrites with the real client address (for example x-real-ip). Rate limits need a trusted source. | `lib/client-ip.ts, instrumentation.ts` | Vercel forwarding header only (a warning is logged elsewhere) |
| `CLUB_PRESET` | Template | Optional | Which built-in copy set applies: "template" (neutral, the default outside development) or "lang-lang". | `payload/seed/club-defaults.ts` | template |
| `CANONICAL_HOST` | Club identity | Required | The club site host, for example riverbend-cc.example (no https://). Canonical links, redirects and the sitemap use it. | `config/site.ts, next.config.ts` | none (production) |
| `REDIRECT_HOSTS` | Club identity | Optional | Comma separated hosts that 308 to the canonical host (www and the vercel.app alias). | `next.config.ts` | www.<CANONICAL_HOST> |
| `COOKIE_PREFIX` | Club identity | Required | Short prefix for visitor cookie names (letters and digits). | `config/site.ts` | none (production); llcc in development |
| `EXPORT_FILENAME_PREFIX` | Club identity | Optional | Prefix of downloaded CSV file names. | `config/site.ts` | derived from the club short name |
| `VOTE_LABEL` | Club identity | Optional | The name of the best-player award in the UI. | `config/site.ts` | Best player |
| `AGENCY_CREDIT` | Template | Optional | Set to "off" to hide the operator credit in the footer. | `config/site.ts` | shown |
| `GOOGLE_SITE_VERIFICATION_FILE` | Template | Optional | File name from Google Search Console (googleXXXXXXXXXXXXXXXX.html); the site serves it at that address. | `config/site.ts, app/api/google-verification` | not served |
| `PLAYHQ_ORG_ID` | PlayHQ | Required | The club's PlayHQ organisation id (a UUID). | `config/site.ts` | none (production) |
| `PLAYHQ_TEAM_PREFIX` | PlayHQ | Required | Club name as PlayHQ puts it before team names; stripped for display. | `config/site.ts` | none (production) |
| `PLAYHQ_CLIENT_ID` | PlayHQ | Optional | PlayHQ API client id; without it fixtures sync is off. | `lib/playhq/client.ts` | none (sync off) |
| `PLAYHQ_TENANT` | PlayHQ | Optional | PlayHQ tenant code of the national body (ca for Cricket Australia). | `lib/playhq/client.ts` | ca |
| `PLAYHQ_CLUB_URL` | PlayHQ | Optional | The club's public PlayHQ page, for fixture links. | `config/site.ts` | https://www.playhq.com |
| `CLUB_TIMEZONE` | Region and season | Required | IANA timezone for event dates and structured data, for example Australia/Sydney. | `config/site.ts` | Australia/Melbourne |
| `CLUB_LOCALE` | Region and season | Required | Language and region for dates, for example en-AU. | `config/site.ts` | en-AU |
| `CLUB_COUNTRY` | Region and season | Optional | Two-letter country for phone numbers and the privacy notice. | `config/site.ts` | region of CLUB_LOCALE |
| `SEASON_START_MONTH` | Region and season | Required | Month the season starts (1 to 12). | `config/site.ts` | 7 |
| `SEASON_NAME_FORMAT` | Region and season | Optional | "split" names a season 2025/26, "single" names it 2026. | `config/site.ts` | split |
| `OFFICE_CURRENCY` | Region and season | Optional | Currency code for the club office (must have cents). | `config/site.ts` | AUD |
| `OFFICE_LOCALE` | Region and season | Optional | Language and region for office amounts and dates. | `config/site.ts` | CLUB_LOCALE |
| `AUTH_BROKER_ORIGIN` | Sign-in | Optional | Origin of the shared sign-in broker (https). Facebook sign-in through the broker is off while empty. | `lib/signin/broker.ts` | off |
| `AUTH_BROKER_CLUB_ID` | Sign-in | Optional | This club's id in the broker's CLUBS list. | `lib/signin/broker.ts` | off |
| `FACEBOOK_APP_ID` | Sign-in | Optional | The club's own Meta app id (an alternative to the broker). | `lib/facebook-login.ts` | off |
| `FACEBOOK_APP_SECRET` | Sign-in | Optional | The club's own Meta app secret. | `lib/facebook-login.ts` | off |
| `EMAIL_PROVIDER` | Email | Optional | "resend" for real mail ("mock" for demos). Email is off while empty. | `lib/email/env.ts` | off |
| `EMAIL_FROM_ADDRESS` | Email | Optional | The sender address (its domain needs SPF, DKIM and DMARC records). | `lib/email/env.ts` | off |
| `EMAIL_FROM_NAME` | Email | Optional | The sender name shown in inboxes. | `lib/email/env.ts` | the club name |
| `EMAIL_REPLY_TO` | Email | Optional | Where replies go. | `lib/email/env.ts` | the club email address |
| `EMAIL_MAX_RECIPIENTS` | Email | Optional | Most people one send may reach. | `lib/email/env.ts` | built-in cap |
| `RESEND_API_KEY` | Email | Optional | Resend API key. | `lib/email/env.ts` | off |
| `AI_GATEWAY_API_KEY` | Optional services | Optional | Vercel AI Gateway key for the yearbook draft helper; drafting is off while empty. | `lib/yearbooks/ai` | off |
| `YEARBOOK_AI_MODEL` | Optional services | Optional | AI Gateway model used for yearbook drafts. | `lib/ai/yearbook-draft.ts` | the default in config/site.ts |
| `SELECTOR_INVITE_DAYS` | Optional services | Optional | How many days a selector invite link works (1 to 90). | `config/site.ts` | 14 |
| `FACEBOOK_PAGE_ID` | Optional services | Optional | Facebook Page for social posting. | `lib/social/adapters` | off |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Optional services | Optional | Page access token for social posting. | `lib/social/adapters` | off |

Set `CLUB_PRESET=template` (or leave it unset: it is the default outside development). **Never set `CLUB_PRESET=lang-lang` for another club.**

## 4. Register the site in the sign-in broker

Optional but recommended: [broker registration](./broker-registration.md).

## 5. Bootstrap

```
INITIAL_ADMIN_PASSWORD=...   # in your shell, never in a file
pnpm bootstrap:club --profile clubs/<slug>/profile.json --target <host>/<db>            # dry run
pnpm bootstrap:club --profile clubs/<slug>/profile.json --target <host>/<db> --confirm  # apply
```

A remote database needs `ALLOW_REMOTE_DB=yes`; uploading the assets to Blob from your machine needs `BLOB_READ_WRITE_TOKEN` and `ALLOW_REMOTE_BLOB=yes` (otherwise the script skips the assets and tells you to upload them in the admin). Do not run `pnpm seed:demo` against a live club.

## 6. First sign-in and look

- Sign in at `/admin` with the admin email from the profile and `INITIAL_ADMIN_PASSWORD`, then change the password.
- Check Club details (names, contact, social links, search text) and Advanced, Site look (colours, crest, heading font).

## 7. The rest

- **Cron:** the schedules are in `vercel.json` (player sync, social posts, email batch). Set `CRON_SECRET`.
- **Email:** choose a provider, set `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS` and the key, and add SPF, DKIM and DMARC records for the sender domain. Email stays off until all are set.
- **Search Console:** add the property, download the verification file name and set `GOOGLE_SITE_VERIFICATION_FILE`.
- **PlayHQ:** set `PLAYHQ_CLIENT_ID` once PlayHQ issues one, then run `pnpm backfill:matches` for the first history load.

## 8. Smoke checklist

- [ ] Home page shows your name, crest and colours, and nothing of another club.
- [ ] Fixtures page loads (an empty state is fine before PlayHQ is connected).
- [ ] Contact page shows your email and location.
- [ ] A selector invite link works.
- [ ] Facebook sign-in through the broker works (if registered).
- [ ] A fantasy season can be created and opened (if you want one).
- [ ] `/sitemap.xml` and `/robots.txt` use your domain.
