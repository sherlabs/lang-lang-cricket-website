import config from '@payload-config'
import { getPayload, handleEndpoints, type CollectionSlug, type Payload } from 'payload'
import { assertTestDb } from './env'

export async function getTestPayload(): Promise<Payload> {
  assertTestDb(process.env.DATABASE_URI)
  return getPayload({ config })
}

/** Calls the REST handler exactly as the Next route does (anonymous unless a token is given). */
export async function rest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { body?: unknown; token?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- REST bodies are asserted ad hoc in tests
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `JWT ${opts.token}`
  const request = new Request(`http://localhost:3000/api${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const res = await handleEndpoints({ config, request })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

export async function clearCollection(payload: Payload, collection: CollectionSlug): Promise<void> {
  await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true, context: { disableRevalidate: true } })
}

/**
 * Files share one fork (singleFork) and Payload caches its instance on
 * `global._payload`, so a destroyed instance would be handed to the next file.
 */
export async function destroyTestPayload(payload: Payload | undefined): Promise<void> {
  // payload.destroy() (drizzle adapter, 3.90) only clears schema state and never ends the pg pool, so every
  // file used to leave up to DATABASE_POOL_MAX idle connections open for the rest of the run (76 files ~ 230
  // connections against Postgres's limit; WP-0 hypothesis H5, proven by `pnpm test:int:leaks`). Payload's own
  // connect() also checks one client out of the pool and never releases it, so pool.end() alone waits forever:
  // end every client directly.
  type PgClient = { end: () => Promise<void> | void }
  const pool = (payload?.db as unknown as { pool?: { end?: () => Promise<void>; ended?: boolean; _clients?: PgClient[] } } | undefined)?.pool
  try {
    await payload?.destroy()
  } finally {
    try {
      if (pool && !pool.ended) {
        // Closing each client ends its backend. pool.end() is not awaited: it waits for the client Payload
        // checked out and never released (now closed, but pg-pool only drops checked-out clients on release),
        // which cost 5 s per file when it was raced.
        // _clients is a private pg-pool field (3.14); fail loudly if an upgrade renames it, or ~230 connections leak silently.
        if (!Array.isArray(pool._clients)) throw new Error('[int] pg-pool no longer exposes _clients: update destroyTestPayload to close pool connections')
        await Promise.allSettled(pool._clients.map((c) => c.end()))
        void Promise.resolve(pool.end?.()).catch(() => undefined)
      }
    } catch (err) {
      if ((err as Error).message?.startsWith('[int] pg-pool')) throw err
      // already ended; nothing to release
    }
    // Even when destroy throws, the next file must not be handed this instance.
    ;(globalThis as { _payload?: Map<string, unknown> })._payload?.clear()
  }
}

/** A logged-in user's JWT, creating the user first when needed (context.seedAdmin passes the first-register guard). */
export async function tokenFor(payload: Payload, role: 'admin' | 'editor' | 'selector', email = `${role}@example.com`): Promise<string> {
  const password = `${role}-pass-123`
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })
  if (!found.docs.length) {
    await payload.create({ collection: 'users', data: { email, password, role }, context: { seedAdmin: true, disableRevalidate: true } })
  }
  const res = await payload.login({ collection: 'users', data: { email, password } })
  return res.token!
}

/** Resets a global to "never saved" (no row), so defaults apply again. */
export async function resetGlobal(payload: Payload, slug: 'club' | 'site-settings' | 'theme' | 'social-settings'): Promise<void> {
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  await payload.db.drizzle.execute(sql.raw(`DELETE FROM "payload"."${slug.replace(/-/g, '_')}"`))
}

type Rows<T> = { rows: T[] }
const quoteId = (s: string) => `"${s.replace(/"/g, '""')}"`

/**
 * Deletes the given users and every row that references them, in one transaction. The referencing columns are discovered
 * from pg_constraint (any table with a foreign key to payload.users, so notifications, sessions, locked documents and any
 * later table are covered without a hand-kept list). Rows that merely point at a user (a yearbook a test user created) are
 * deleted, not nulled. Asserts afterwards that nothing references the ids.
 */
export async function dropTestUsers(payload: Payload, emails: readonly string[]): Promise<void> {
  if (!emails.length) return
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  await payload.db.drizzle.transaction(async (tx) => {
    const found = (await tx.execute(sql`SELECT id FROM payload.users WHERE email IN (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`)) as unknown as Rows<{ id: number }>
    const ids = found.rows.map((r) => Number(r.id))
    if (!ids.length) return
    const idList = sql.raw(ids.join(', '))
    const refs = (await tx.execute(sql`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'payload.users'::regclass AND c.conrelid <> 'payload.users'::regclass`)) as unknown as Rows<{ tbl: string; col: string }>
    const refTables = refs.rows.map((r) => ({ tbl: r.tbl.split('.').map((p) => quoteId(p.replace(/^"|"$/g, ''))).join('.'), col: quoteId(r.col) }))
    // Delete referencing rows first (a few passes: a deleted row can itself be referenced, for example a yearbook's children).
    for (let pass = 0; pass < 3; pass++) {
      for (const { tbl, col } of refTables) await tx.execute(sql.raw(`DELETE FROM ${tbl} WHERE ${col} IN (${ids.join(', ')})`))
    }
    await tx.execute(sql`DELETE FROM payload.users WHERE id IN (${idList})`)
    for (const { tbl, col } of refTables) {
      const left = (await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${tbl} WHERE ${col} IN (${ids.join(', ')})`))) as unknown as Rows<{ n: number }>
      if (left.rows[0].n) throw new Error(`[int] dropTestUsers: ${tbl}.${col} still references the removed users`)
    }
  })
}

/** Deletes every row of the named payload tables (in the order given: children first) and asserts they are empty. */
export async function cleanTestTables(payload: Payload, tables: readonly string[]): Promise<void> {
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  await payload.db.drizzle.transaction(async (tx) => {
    for (const t of tables) await tx.execute(sql.raw(`DELETE FROM payload.${quoteId(t)}`))
    for (const t of tables) {
      const left = (await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM payload.${quoteId(t)}`))) as unknown as Rows<{ n: number }>
      if (left.rows[0].n) throw new Error(`[int] cleanTestTables: payload.${t} still has ${left.rows[0].n} rows`)
    }
  })
}

/**
 * Empties every payload data table (all but payload_migrations) in one TRUNCATE, so a file that created rows through the
 * app leaves nothing behind. Call it first in `afterAll`, before destroyTestPayload. The strict leak audit
 * (`pnpm test:int:leaks`) fails any file that skips it while leaving rows.
 */
export async function wipeTestData(payload: Payload): Promise<void> {
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  const res = (await payload.db.drizzle.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'payload' AND tablename <> 'payload_migrations'`)) as unknown as Rows<{ tablename: string }>
  if (!res.rows.length) return
  await payload.db.drizzle.execute(sql.raw(`TRUNCATE ${res.rows.map((r) => `payload.${quoteId(r.tablename)}`).join(', ')} RESTART IDENTITY CASCADE`))
}
