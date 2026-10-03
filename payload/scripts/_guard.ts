/**
 * Script-level guard imported by every `payload run` script (spec §11.6).
 * The environment-level layer is assertSafeEnv() in payload.config.ts.
 *
 * - parses DATABASE_URI
 * - requires `--target <host>/<db>` to equal it exactly
 * - requires `--confirm` for any write (scripts call `guard({ write: true })`)
 * - requires ALLOW_REMOTE_DB=yes when the host is not local
 * - prints the target and waits 5 s before writing (GUARD_NO_DELAY=1 skips the wait, local only)
 */
import { dbHostsOf } from '../env'

const LOCAL = new Set(['127.0.0.1', 'localhost'])

export type GuardResult = { host: string; db: string; target: string; local: boolean; confirmed: boolean }

export function argValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i >= 0) return argv[i + 1]
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  return eq?.slice(name.length + 1)
}

export function checkGuard(
  opts: { write: boolean },
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): GuardResult {
  const uri = env.DATABASE_URI
  if (!uri) throw new Error('[guard] DATABASE_URI is not set')
  const url = new URL(uri)
  // A `?host=`/`?hostaddr=` parameter overrides the URL host in node-postgres (dbHostsOf).
  const hosts = dbHostsOf(uri, 'DATABASE_URI')
  const host = hosts.find((h) => !LOCAL.has(h)) ?? hosts[0]
  const db = url.pathname.replace(/^\//, '')
  const target = `${host}/${db}`
  const given = argValue(argv, '--target')
  if (!given) throw new Error(`[guard] pass --target ${target} to confirm the database this script will use`)
  if (given !== target) throw new Error(`[guard] --target ${given} does not match DATABASE_URI (${target})`)
  const local = hosts.every((h) => LOCAL.has(h))
  if (!local && env.ALLOW_REMOTE_DB !== 'yes') throw new Error(`[guard] ${host} is not local; ALLOW_REMOTE_DB=yes is required`)
  const confirmed = argv.includes('--confirm')
  if (opts.write && !confirmed) throw new Error('[guard] this script writes; re-run with --confirm')
  return { host, db, target, local, confirmed }
}

export async function guard(opts: { write: boolean }): Promise<GuardResult> {
  const result = checkGuard(opts)
  console.log(`[guard] target: ${result.target}${opts.write ? ' (WRITE)' : ' (read-only)'}`)
  if (opts.write && !(result.local && process.env.GUARD_NO_DELAY === '1')) {
    console.log('[guard] writing in 5 s — Ctrl-C to abort')
    await new Promise((r) => setTimeout(r, 5000))
  }
  return result
}
