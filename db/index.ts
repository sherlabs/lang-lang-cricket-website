// Transitional (WP1–WP5): the public pages still read the legacy tables through
// drizzle, now over node-postgres against LEGACY_DATABASE_URL (local
// langlang_legacy in development). Deleted in WP6. Never DATABASE_URL.
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { assertSafeEnv } from '@/payload/env'
import * as schema from './schema'

assertSafeEnv(process.env, 'LEGACY_DATABASE_URL')

const globalForDb = globalThis as unknown as { __legacyPool?: pg.Pool }

function pool(): pg.Pool {
  const connectionString = process.env.LEGACY_DATABASE_URL
  if (!connectionString) throw new Error('[db] LEGACY_DATABASE_URL is not set')
  globalForDb.__legacyPool ??= new pg.Pool({ connectionString, max: 3 })
  return globalForDb.__legacyPool
}

export const db = drizzle({ client: pool(), schema })
