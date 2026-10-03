// Transitional (WP1–WP5): the public pages still read the legacy tables through
// drizzle, now over node-postgres against LEGACY_DATABASE_URL (local
// langlang_legacy in development). Deleted in WP6. Never DATABASE_URL.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { assertSafeEnv } from '@/payload/env'
import * as schema from './schema'

assertSafeEnv(process.env, 'LEGACY_DATABASE_URL')

type LegacyDb = NodePgDatabase<typeof schema>
const globalForDb = globalThis as unknown as { __legacyPool?: pg.Pool; __legacyDb?: LegacyDb }

function realDb(): LegacyDb {
  if (!globalForDb.__legacyDb) {
    const connectionString = process.env.LEGACY_DATABASE_URL
    if (!connectionString) throw new Error('[db] LEGACY_DATABASE_URL is not set')
    globalForDb.__legacyPool ??= new pg.Pool({ connectionString, max: 3 })
    globalForDb.__legacyDb = drizzle({ client: globalForDb.__legacyPool, schema })
  }
  return globalForDb.__legacyDb
}

/**
 * Created on first use, not at import: `next build` imports every route module, and
 * LEGACY_DATABASE_URL is not set on Vercel (spec §11.1), so an import-time throw would
 * fail the build. Every route that queries it is force-dynamic.
 */
export const db = new Proxy({} as LegacyDb, {
  get(_target, prop) {
    const real = realDb()
    const value = Reflect.get(real, prop, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})
