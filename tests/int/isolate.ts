/**
 * WP-0 (wave E): why the full suite flaked, and what makes it hermetic now.
 *
 * Proven (measured, see commit message): files used to share one database with leftovers (media 6,
 * announcements 3, users 1, club_apparel 1 after four files), one process.env that only a fixed
 * list of names was reset on, and a file order that vitest derived from the previous run's cached
 * results (failed first, then longest), so one failure reshuffled the next run. Fixes, all
 * structural (no retries, no raised timeouts):
 *  1. tests/sequencer.ts: files run in path order (the results cache cannot reorder them).
 *  2. Every payload table except payload_migrations is TRUNCATEd before each file (below), with
 *     lock/statement timeouts that name the blocking backend instead of hanging. globalSetup has
 *     a sentinel proving migrations seed nothing.
 *  3. process.env and globalThis.fetch are restored to the first file's baseline before every file,
 *     and each file's stubs are undone after it (an afterAll below). The vitest unstubEnvs /
 *     unstubGlobals config flags are NOT used: they undo after every TEST, which breaks the
 *     files that stub fetch in beforeAll (etl, media-register).
 *  4. INT_LEAKS=1 (pnpm test:int:leaks) audits instead: fails a file that leaves env keys,
 *     globalThis keys or open database connections behind, and lists tables it left rows in.
 * The advisory run lock in setup.ts keeps two int runs from sharing langlang_test.
 *
 * Hypotheses (H1-H6 in docs/superpowers/specs/2026-10-12-wave-e-iq-design.md section 2.2):
 *  H1 residue between files: PROVEN as a hazard (four-file run left media 6, announcements 3, users 1...),
 *     cured by the per-file truncate; shuffle.files x3 seeds green.
 *  H2 order from the results cache: PROVEN mechanism (vitest default sequencer); cured by tests/sequencer.ts.
 *  H3 leaked process state: PROVEN for PAYLOAD_BLOB_FAKE (wp1-verification never deleted it); env restore
 *     now covers any name. Stubs: unstubGlobals/unstubEnvs config flags REJECTED (they undo per test and broke
 *     etl and media-register, which stub fetch in beforeAll); undone per file in the afterAll below instead.
 *  H4 time/async race in office-email "stopping ends sending": REJECTED as a code race. The test awaits every
 *     step; 20/20 green alone under full-core CPU load. The earlier failures match leaked EMAIL_* env between
 *     tests/files (stubEnv without restore), cured by H3.
 *  H5 connections: PROVEN. Payload's drizzle destroy() never ends the pg pool and connect() holds one client
 *     forever, so each file leaked its pool (about 3 connections x 76 files). destroyTestPayload now ends them.
 *  H6 unit + int competing for CPU: not measured separately; full runs (unit + int) were green 5 of 5.
 * Unproven remainder: under saturating CPU load (yes x every core) etl, media-register and club-apparel
 * still hit vitest's own 60 s test timeout or its worker RPC timeout in a few runs of 20 (see the WP-0
 * commit message for the measured rates). They are load-induced timeouts, not logic failures, and pass alone.
 *
 * Runs before every int test file (vitest `setupFiles`). Files share one fork, one process
 * environment and Payload's `global._payload` cache, and a file's own cleanup runs only if its
 * `afterAll` gets that far: a teardown that times out (a loaded machine) or throws used to leave
 * `PAYLOAD_BLOB_FAKE` set, or a destroyed or differently configured Payload instance cached, for
 * whichever file ran next. That showed up as intermittent failures that pass alone: pages.int tried
 * a real Vercel Blob upload, and etl.int saw image/jpeg for image/png (a gallery photo written
 * through a leaked config took another path). Every file now starts from a clean slate, whatever
 * the previous one managed to clean up.
 */
import { afterAll, expect, vi } from 'vitest'
import pg from 'pg'
import { restoreEnv, snapshotEnv } from './env-snapshot'
import { assertTestDb } from './env'

type Store = { pidsAtStart?: Set<number>; env?: Record<string, string>; fetch?: typeof fetch; globalKeys?: Set<string>; lastFile?: string }
const store = ((globalThis as { __intHermetic?: Store }).__intHermetic ??= {})
const leakMode = process.env.INT_LEAKS === '1'

// The first file's starting env (global setup already merged the test env) is the baseline.
store.env ??= snapshotEnv(process.env)
store.globalKeys ??= new Set(Object.getOwnPropertyNames(globalThis))
restoreEnv(process.env, store.env)
store.fetch ??= globalThis.fetch
globalThis.fetch = store.fetch
;(globalThis as { _payload?: Map<string, unknown> })._payload?.clear()

const testFile = () => expect.getState().testPath ?? 'unknown file'

async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  assertTestDb(process.env.DATABASE_URI)
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI, application_name: 'int-isolate', statement_timeout: 15_000 })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function dataTables(c: pg.Client): Promise<string[]> {
  const res = await c.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'payload' AND tablename <> 'payload_migrations' ORDER BY 1",
  )
  return res.rows.map((r) => r.tablename)
}

/** Rows per non-empty table (exact counts; used only by the audit). */
async function residue(c: pg.Client): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of await dataTables(c)) {
    const n = Number((await c.query(`SELECT count(*) AS n FROM payload."${t}"`)).rows[0].n)
    if (n > 0) out[t] = n
  }
  return out
}

async function blockers(c: pg.Client, ignore?: Set<number>): Promise<string> {
  const res = await c.query(
    `SELECT pid, state, application_name, left(query, 120) AS query, pg_blocking_pids(pid) AS blocked_by
       FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()`,
  )
  return res.rows.filter((r) => !ignore?.has(r.pid)).map((r) => `pid=${r.pid} state=${r.state} app=${r.application_name} blocked_by=${JSON.stringify(r.blocked_by)} query=${r.query}`).join('\n')
}

async function truncateAll(): Promise<void> {
  assertTestDb(process.env.DATABASE_URI)
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI, application_name: 'int-isolate', statement_timeout: 15_000 })
  await client.connect()
  try {
    await client.query("SET lock_timeout = '5s'")
    const tables = await dataTables(client)
    if (!tables.length) return
    try {
      await client.query(`TRUNCATE ${tables.map((t) => `payload."${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
    } catch (err) {
      // A connection left open by an earlier file's timed-out afterAll holds the lock.
      throw new Error(`[int] truncate before ${testFile()} failed (${(err as Error).message}). Backends:\n${await blockers(client).catch(() => '(could not list)')}`)
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

await truncateAll()
if (leakMode) store.pidsAtStart = new Set(await withClient(async (c) => (await c.query("SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()")).rows.map((r) => r.pid as number)))

// Runs after the file's own afterAll hooks (hooks stack): undo what the file stubbed.
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

if (leakMode) {
  afterAll(async () => {
    const problems: string[] = []
    // VIPSHOME is set by sharp when it loads (benign, process-wide).
    const extraEnv = restoreEnv({ ...process.env }, store.env!).filter((k) => k !== 'VIPSHOME')
    if (extraEnv.length) problems.push(`env keys added/changed/removed: ${extraEnv.join(', ')}`)
    // Payload itself caches its instance and the lexical editor config on globalThis (expected, cleared per file).
    const expectedGlobal = (k: string) => k === '_payload' || k === '__NEXT_IMAGE_IMPORTED' || /^_?payload_lexical_/.test(k)
    const extraGlobals = Object.getOwnPropertyNames(globalThis).filter((k) => !store.globalKeys!.has(k) && !expectedGlobal(k))
    if (extraGlobals.length) problems.push(`globalThis keys added: ${extraGlobals.join(', ')}`)
    await new Promise((r) => setTimeout(r, 500)) // let a just-destroyed pool finish closing
    const { rows, conns } = await withClient(async (c) => ({
      rows: await residue(c),
      conns: await blockers(c, store.pidsAtStart),
    }))
    if (conns) problems.push(`database connections opened by this file and still open after it:\n${conns}`)
    const left = Object.entries(rows).map(([t, n]) => `${t}=${n}`)
    // Row residue is informational: the per-file truncate is the contract. Printed so cleanup can be tightened.
    if (left.length) console.warn(`[int:leaks] ${testFile()} left rows: ${left.join(' ')}`)
    store.lastFile = testFile()
    if (problems.length) throw new Error(`[int:leaks] ${testFile()}\n${problems.join('\n')}`)
  }, 60_000)
}
