/**
 * Int runs share one test database and this setup drops its schema, so two runs at once (two
 * worktrees, two agents, a stray watch) wipe each other's tables mid-test and produce
 * intermittent, order-looking failures (etl.int saw image/jpeg for image/png: its sibling run
 * deleted the colliding gallery row, so the in-place registration won). A session-level
 * advisory lock, held on an open connection until teardown, makes the second run wait.
 */
const RUN_LOCK_KEY = 7_450_100_193

/**
 * vitest globalSetup for the int project (spec §15):
 * refuses any non-local / non-*_test DATABASE_URI, drops and recreates schema
 * `payload`, then runs `payload migrate` (which also proves the migrations are complete).
 */
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { assertTestDb, intTestEnv } from './env'

export default async function setup() {
  const env = intTestEnv()
  assertTestDb(env.DATABASE_URI)
  Object.assign(process.env, env)

  const lock = new pg.Client({ connectionString: env.DATABASE_URI })
  await lock.connect()
  await lock.query('SELECT pg_advisory_lock($1)', [RUN_LOCK_KEY]) // blocks while another int run is active
  try {
    await lock.query('DROP SCHEMA IF EXISTS payload CASCADE')
    // The first migration creates the schema itself (CREATE SCHEMA IF NOT EXISTS).
    execFileSync('./node_modules/.bin/payload', ['migrate'], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  } catch (err) {
    await lock.end()
    throw err
  }
  // Released when the run ends (and by Postgres itself if the process dies).
  return async () => {
    await lock.end()
  }
}
