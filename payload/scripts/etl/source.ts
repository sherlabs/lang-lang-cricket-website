/**
 * Legacy ETL source (spec §12.1): `LEGACY_DATABASE_URL` through its own pg.Pool, read-only
 * three ways (unpooled host only; `default_transaction_read_only` on every connection and
 * `BEGIN READ ONLY` around every read; `SHOW transaction_read_only` asserted before the first
 * read). `timestamp without time zone` values are parsed as UTC wall-clock (Drizzle semantics).
 */
import pg from 'pg'
import { assertSafeEnv, dbHostsOf } from '../../env'

/** pg type 1114: `timestamp without time zone`. Up to 6 fractional digits → 3, read as UTC. */
export function parseLegacyTimestamp(v: string): Date {
  return new Date(v.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1') + 'Z')
}

const types = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === 1114) return (v: string) => parseLegacyTimestamp(v)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg's overloads are not expressible here
    return (pg.types.getTypeParser as any)(oid, format)
  },
}

export type LegacyRow = Record<string, unknown>

export type LegacySource = {
  schema: string
  /** Rows of `SELECT * FROM <schema>.<table> ORDER BY id` (or a custom query), in a READ ONLY transaction. */
  rows<T extends LegacyRow = LegacyRow>(table: string, orderBy?: string): Promise<T[]>
  query<T extends LegacyRow = LegacyRow>(sql: string, params?: unknown[]): Promise<T[]>
  /** `last_value` of `<table>_id_seq` (0 when the sequence is missing or unused). */
  sequenceLastValue(table: string): Promise<number>
  tableExists(table: string): Promise<boolean>
  close(): Promise<void>
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`[etl] bad identifier: ${s}`)
  return `"${s}"`
}

export async function openLegacySource(opts: { url?: string; schema?: string } = {}): Promise<LegacySource> {
  const url = opts.url ?? process.env.LEGACY_DATABASE_URL
  if (!url) throw new Error('[etl] LEGACY_DATABASE_URL is not set')
  // Same host rule as DATABASE_URI: local unless the operator shell sets ALLOW_REMOTE_DB=yes.
  assertSafeEnv({ ...process.env, LEGACY_DATABASE_URL: url }, 'LEGACY_DATABASE_URL')
  if (dbHostsOf(url, 'LEGACY_DATABASE_URL').some((h) => h.includes('-pooler'))) {
    throw new Error('[etl] LEGACY_DATABASE_URL must be the UNPOOLED (direct) URL, not a -pooler host')
  }
  const schema = opts.schema ?? 'public'
  const pool = new pg.Pool({ connectionString: url, max: 2, types })
  // Queued as the client's first query (pg runs a client's queries in order); a failure is
  // caught by the per-connection check below rather than swallowed.
  pool.on('connect', (client) => {
    client.query('SET default_transaction_read_only = on').catch(() => {})
  })

  // Defence in depth behind `BEGIN READ ONLY` (spec §12.1): every pooled connection must report
  // default_transaction_read_only = on, checked once per connection OUTSIDE a transaction block
  // (inside `BEGIN READ ONLY`, transaction_read_only is always on and proves nothing).
  const verified = new WeakSet<pg.PoolClient>()
  async function assertSessionReadOnly(client: pg.PoolClient): Promise<void> {
    if (verified.has(client)) return
    const res = await client.query<{ default_transaction_read_only: string }>('SHOW default_transaction_read_only')
    if (res.rows[0]?.default_transaction_read_only !== 'on') {
      throw new Error('[etl] legacy source session is not read-only (default_transaction_read_only); refusing to continue')
    }
    verified.add(client)
  }

  async function readOnly<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect()
    try {
      await assertSessionReadOnly(client)
      await client.query('BEGIN READ ONLY')
      const out = await fn(client)
      await client.query('COMMIT')
      return out
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  // Fail fast at open (readOnly() runs the per-connection session check first).
  await readOnly(async () => undefined)

  const source: LegacySource = {
    schema,
    rows: (table, orderBy = 'id') =>
      readOnly(async (c) => (await c.query(`SELECT * FROM ${ident(schema)}.${ident(table)} ORDER BY ${orderBy}`)).rows),
    query: (sql, params) => readOnly(async (c) => (await c.query(sql, params)).rows),
    async sequenceLastValue(table) {
      return readOnly(async (c) => {
        const seq = `${schema}.${table}_id_seq`
        const exists = await c.query('SELECT to_regclass($1) AS r', [seq])
        if (!exists.rows[0]?.r) return 0
        const r = await c.query(`SELECT last_value, is_called FROM ${ident(schema)}.${ident(`${table}_id_seq`)}`)
        return r.rows[0]?.is_called ? Number(r.rows[0].last_value) : 0
      })
    },
    async tableExists(table) {
      return readOnly(async (c) => Boolean((await c.query('SELECT to_regclass($1) AS r', [`${schema}.${table}`])).rows[0]?.r))
    },
    close: () => pool.end(),
  }
  return source
}
