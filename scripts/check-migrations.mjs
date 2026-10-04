// Replays the committed migrations on a scratch DB (spec §11.3). The URL is
// HARD-CODED and the environment's DATABASE_URI is ignored, so this can never
// touch anything but the local langlang_mig database.
import { execFileSync } from 'node:child_process'
import pg from 'pg'

const ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:54329/postgres'
const MIG_URL = 'postgres://postgres:postgres@127.0.0.1:54329/langlang_mig'

const admin = new pg.Client({ connectionString: ADMIN_URL })
await admin.connect()
await admin.query('DROP DATABASE IF EXISTS langlang_mig WITH (FORCE)')
await admin.query('CREATE DATABASE langlang_mig')
await admin.end()

const env = {
  ...process.env,
  DATABASE_URI: MIG_URL,
  PAYLOAD_PUSH: 'false',
  BLOB_READ_WRITE_TOKEN: '',
  NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'check-migrations-secret',
}
const bin = './node_modules/.bin/payload'
execFileSync(bin, ['migrate'], { env, stdio: 'inherit' })
const status = execFileSync(bin, ['migrate:status'], { env, encoding: 'utf8' })
process.stdout.write(status)

const rows = status.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => /\d{8}_\d{6}_/.test(l))
if (!rows.length) {
  console.error('check-migrations: no migrations listed')
  process.exit(1)
}
const notRan = rows.filter((l) => !/\bYes\b|\bRan\b/i.test(l))
if (notRan.length) {
  console.error(`check-migrations: ${notRan.length} migration(s) did not run:\n${notRan.join('\n')}`)
  process.exit(1)
}
console.log(`check-migrations: ${rows.length} migration(s) ran cleanly on langlang_mig`)
