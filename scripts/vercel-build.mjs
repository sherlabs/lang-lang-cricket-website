// Vercel build entry (spec §11.5): `pnpm vercel-build`.
//  0. Refuse when PROD_DATABASE_HOST is empty (the preview guard would fail open).
//  1. production: `payload migrate` over DATABASE_URI_UNPOOLED, then `next build`.
//  2. preview: refuse when either DB URL host is the production host (ignoring a
//     -pooler suffix) or BLOB_DELETE_DISABLED !== '1'; migrate the branch, build.
//  3. otherwise: `next build` only.
import { execFileSync } from 'node:child_process'

const env = process.env
const fail = (msg) => {
  console.error(`[vercel-build] ${msg}`)
  process.exit(1)
}
const bareHost = (url, name) => {
  if (!url) fail(`${name} is not set`)
  try {
    return new URL(url).hostname.replace('-pooler', '')
  } catch {
    fail(`${name} is not a valid URL`)
  }
}
const run = (cmd, args, extraEnv = {}) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...env, ...extraEnv } })

const prodHost = (env.PROD_DATABASE_HOST ?? '').trim().replace('-pooler', '')
if (!prodHost) fail('PROD_DATABASE_HOST is empty; set it (a hostname, not a secret) for all environments')

const payload = './node_modules/.bin/payload'
const next = './node_modules/.bin/next'

if (env.VERCEL_ENV === 'production') {
  run(payload, ['migrate'], { DATABASE_URI: env.DATABASE_URI_UNPOOLED ?? fail('DATABASE_URI_UNPOOLED is not set') })
  run(next, ['build'])
} else if (env.VERCEL_ENV === 'preview') {
  for (const name of ['DATABASE_URI', 'DATABASE_URI_UNPOOLED']) {
    if (bareHost(env[name], name) === prodHost) fail(`${name} points at the production database host; previews must use a Neon branch`)
  }
  if (env.BLOB_DELETE_DISABLED !== '1') fail('BLOB_DELETE_DISABLED must be "1" on previews')
  run(payload, ['migrate'], { DATABASE_URI: env.DATABASE_URI_UNPOOLED })
  run(next, ['build'])
} else {
  run(next, ['build'])
}
