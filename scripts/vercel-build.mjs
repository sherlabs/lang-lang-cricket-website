// Vercel build entry (spec §11.5): `pnpm vercel-build`.
//  0. Refuse when PROD_DATABASE_HOST is empty (the preview guard would fail open).
//  1. production: `payload migrate` over DATABASE_URI_UNPOOLED, then `next build`.
//  2. preview: refuse when any host of either DB URL (URL host, ?host=, ?hostaddr=) is the
//     production host (case-insensitive, ignoring a -pooler suffix) or BLOB_DELETE_DISABLED !== '1'; migrate the branch, build.
//     Opt-in exception: PREVIEW_SHARES_PROD_DB=yes lets a preview use the production database. Payload only
//     ever creates/changes tables inside its own `payload` schema (schemaName in payload.config.ts), so
//     `public.*` (the legacy site) is untouched. BLOB_DELETE_DISABLED=1 is still required.
//  3. otherwise: `next build` only.
import { execFileSync } from 'node:child_process'

const env = process.env
const fail = (msg) => {
  console.error(`[vercel-build] ${msg}`)
  process.exit(1)
}
// Every host pg could connect to: each ?host= / ?hostaddr= entry (comma lists) plus the URL
// host — the same set as dbHostsOf() in payload/env.ts — lowercased, -pooler stripped.
const bareHost = (h) => h.trim().toLowerCase().replace('-pooler', '')
const hostsOf = (url, name) => {
  if (!url) fail(`${name} is not set`)
  let u
  try {
    u = new URL(url)
  } catch {
    fail(`${name} is not a valid URL`)
  }
  const fromParams = ['host', 'hostaddr'].flatMap((k) => u.searchParams.getAll(k).flatMap((v) => v.split(',')))
  return [...fromParams, u.hostname].map(bareHost).filter(Boolean)
}
const run = (cmd, args, extraEnv = {}) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...env, ...extraEnv } })

const prodHost = bareHost(env.PROD_DATABASE_HOST ?? '')
if (!prodHost) fail('PROD_DATABASE_HOST is empty; set it (a hostname, not a secret) for all environments')

const payload = './node_modules/.bin/payload'
const next = './node_modules/.bin/next'

if (env.VERCEL_ENV === 'production') {
  run(payload, ['migrate'], { DATABASE_URI: env.DATABASE_URI_UNPOOLED || fail('DATABASE_URI_UNPOOLED is not set') })
  run(next, ['build'])
} else if (env.VERCEL_ENV === 'preview') {
  const sharesProdDb = env.PREVIEW_SHARES_PROD_DB === 'yes'
  for (const name of ['DATABASE_URI', 'DATABASE_URI_UNPOOLED']) {
    if (!sharesProdDb && hostsOf(env[name], name).includes(prodHost)) {
      fail(`${name} points at the production database host; previews must use a Neon branch (or set PREVIEW_SHARES_PROD_DB=yes to use the payload schema in the production database)`)
    }
  }
  if (sharesProdDb) console.warn('[vercel-build] PREVIEW_SHARES_PROD_DB=yes: migrating the payload schema in the shared database; public.* is not touched')
  if (env.BLOB_DELETE_DISABLED !== '1') fail('BLOB_DELETE_DISABLED must be "1" on previews')
  run(payload, ['migrate'], { DATABASE_URI: env.DATABASE_URI_UNPOOLED })
  run(next, ['build'])
} else {
  run(next, ['build'])
}
