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

  const client = new pg.Client({ connectionString: env.DATABASE_URI })
  await client.connect()
  try {
    await client.query('DROP SCHEMA IF EXISTS payload CASCADE')
  } finally {
    await client.end()
  }
  // The first migration creates the schema itself (CREATE SCHEMA IF NOT EXISTS).
  execFileSync('./node_modules/.bin/payload', ['migrate'], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
