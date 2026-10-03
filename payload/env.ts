/**
 * Environment guards shared by payload.config.ts (so every entry point — next
 * dev/start/build, the payload CLI, scripts, tests — is covered) and by the
 * ETL's legacy source (`LEGACY_DATABASE_URL`). Spec §1 / D4.
 *
 * Deliberately keyed on `process.env.VERCEL`, not NODE_ENV: a local `next start`
 * runs with NODE_ENV=production and must still be guarded.
 */

/** Store id embedded in the fake token; the legacy fixture uses the same host. */
export const FAKE_BLOB_STORE_ID = 'fakestore'
/** Test-only token (never a real store). Passed straight to the plugin, never via env. */
export const FAKE_BLOB_TOKEN = `vercel_blob_rw_${FAKE_BLOB_STORE_ID}_0000000000000000000000000000000000`

/** A plain env map (not NodeJS.ProcessEnv, whose Next augmentation requires NODE_ENV). */
export type Env = Record<string, string | undefined>

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`[env] ${name} is required but not set`)
  return value
}

/**
 * Every host a Postgres URL can connect to. node-postgres (pg-connection-string) lets a
 * `?host=` query parameter override the URL host, and libpq also honours `hostaddr`, so
 * both count; each may be a comma-separated list. The first entry is the effective host.
 */
export function dbHostsOf(url: string, name = 'database URL'): string[] {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`[env] ${name} is not a valid URL`)
  }
  const fromParams = ['host', 'hostaddr'].flatMap((k) => parsed.searchParams.getAll(k).flatMap((v) => v.split(',')))
  const hosts = [...fromParams, parsed.hostname].map((h) => h.trim()).filter(Boolean)
  return hosts.length ? hosts : ['']
}

function hostOf(url: string, name: string): string {
  const hosts = dbHostsOf(url, name)
  return hosts.find((h) => !LOCAL_HOSTS.has(h)) ?? hosts[0]
}

export function isLocalDbUrl(url: string): boolean {
  return dbHostsOf(url).every((h) => LOCAL_HOSTS.has(h))
}

/**
 * Off Vercel: refuse a non-local DATABASE_URI (unless ALLOW_REMOTE_DB=yes) and
 * any BLOB_READ_WRITE_TOKEN (unless ALLOW_REMOTE_BLOB=yes). Only the operator's
 * cutover shell sets those flags.
 */
export function assertSafeEnv(env: Env = process.env, dbVar = 'DATABASE_URI'): void {
  if (env.VERCEL) return
  const url = env[dbVar]
  if (url && !isLocalDbUrl(url) && env.ALLOW_REMOTE_DB !== 'yes') {
    throw new Error(
      `[env] Refusing to start: ${dbVar} points at "${hostOf(url, dbVar)}", which is not local. ` +
        'Use the local Postgres (127.0.0.1). The operator cutover shell may set ALLOW_REMOTE_DB=yes.',
    )
  }
  if (env.BLOB_READ_WRITE_TOKEN && env.ALLOW_REMOTE_BLOB !== 'yes') {
    throw new Error(
      '[env] Refusing to start: BLOB_READ_WRITE_TOKEN is set outside Vercel. Remove it from your env ' +
        '(local files go to ./media etc.). The operator cutover shell may set ALLOW_REMOTE_BLOB=yes.',
    )
  }
}

/** Throws unless DATABASE_URI is local. Returns true so it can gate `push`. */
export function assertLocalDb(env: Env = process.env): true {
  const url = env.DATABASE_URI ?? ''
  if (!url || !isLocalDbUrl(url)) {
    throw new Error('[env] PAYLOAD_PUSH=true is only allowed against a local DATABASE_URI (127.0.0.1 / localhost)')
  }
  return true
}

/**
 * The Blob token for the storage plugin and every @vercel/blob call:
 * - on Vercel, or with ALLOW_REMOTE_BLOB=yes: the real env token;
 * - PAYLOAD_BLOB_FAKE=1 off Vercel: a fixed fake token (tests mock @vercel/blob);
 * - otherwise undefined → plugin disabled, core local storage on disk.
 */
export function blobToken(env: Env = process.env): string | undefined {
  if (env.VERCEL || env.ALLOW_REMOTE_BLOB === 'yes') return env.BLOB_READ_WRITE_TOKEN || undefined
  if (env.PAYLOAD_BLOB_FAKE === '1') return FAKE_BLOB_TOKEN
  return undefined
}

/**
 * Payload's serverURL. Never '' — an unset serverURL makes Payload treat every
 * URL as local and leaves `csrf` empty (which disables the Origin check).
 */
export function resolveServerURL(env: Env = process.env): string {
  if (env.VERCEL_ENV === 'preview') {
    const branch = env.VERCEL_BRANCH_URL
    if (!branch) throw new Error('[env] VERCEL_BRANCH_URL is required on preview deployments')
    return `https://${branch}`
  }
  const url = env.NEXT_PUBLIC_SERVER_URL
  if (!url) throw new Error('[env] NEXT_PUBLIC_SERVER_URL is required (e.g. http://localhost:3000)')
  return url.replace(/\/+$/, '')
}

/** Explicit CSRF origin list: serverURL, plus the deployment URL on previews. */
export function csrfOrigins(serverURL: string, env: Env = process.env): string[] {
  const origins = [serverURL]
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) origins.push(`https://${env.VERCEL_URL}`)
  return [...new Set(origins)]
}
