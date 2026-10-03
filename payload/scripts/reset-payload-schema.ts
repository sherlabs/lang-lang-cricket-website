/**
 * Drop the Payload schema before a second cutover attempt (spec §13.4). Guarded by `_guard.ts`
 * (`--target <host>/<db>` must equal DATABASE_URI, `--confirm`, ALLOW_REMOTE_DB=yes for a
 * remote host, 5 s pause). It runs `DROP SCHEMA "payload" CASCADE` and nothing else: the schema
 * name is fixed and any `--schema` other than `payload` is refused. `public.*` (the legacy
 * tables) is never touched. It does not boot Payload (with PAYLOAD_PUSH a boot would push first).
 *
 *   pnpm payload run payload/scripts/reset-payload-schema.ts -- --target <host>/<db> --confirm
 */
import pg from 'pg'
import { argValue, guard } from './_guard'

export const PAYLOAD_SCHEMA = 'payload'

async function main() {
  const schema = argValue(process.argv, '--schema') ?? PAYLOAD_SCHEMA
  if (schema !== PAYLOAD_SCHEMA) throw new Error(`[reset] refusing schema "${schema}": only "${PAYLOAD_SCHEMA}" can be reset`)
  const target = await guard({ write: true })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  try {
    const before = await client.query<{ n: string }>(`SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = $1`, [PAYLOAD_SCHEMA])
    await client.query(`DROP SCHEMA IF EXISTS "${PAYLOAD_SCHEMA}" CASCADE`)
    console.log(`[reset] dropped schema "${PAYLOAD_SCHEMA}" (${before.rows[0]?.n ?? 0} tables) on ${target.target}. Next: payload migrate.`)
  } finally {
    await client.end()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
