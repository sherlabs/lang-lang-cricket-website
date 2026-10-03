import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

/** Only a local *_test database may ever be used by the int project (spec §15). */
export const TEST_DB_PATTERN = /^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/[a-z_]+_test$/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function loadEnvFiles(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['.env', '.env.local', '.env.test', '.env.test.local']) {
    const file = path.join(root, name)
    if (existsSync(file)) Object.assign(out, parseEnv(readFileSync(file, 'utf8')))
  }
  return out
}

/** Env for the int project: .env files + shell, with DATABASE_URI forced to DATABASE_URI_TEST. */
export function intTestEnv(): Record<string, string> {
  const fileEnv = loadEnvFiles()
  const testUri = process.env.DATABASE_URI_TEST ?? fileEnv.DATABASE_URI_TEST ?? ''
  return {
    DATABASE_URI: testUri,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? fileEnv.PAYLOAD_SECRET ?? 'int-test-secret',
    NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
    PAYLOAD_PUSH: 'false',
    // Never a real token in tests; files the plugin would store go through PAYLOAD_BLOB_FAKE + mocks.
    BLOB_READ_WRITE_TOKEN: '',
  }
}

export function assertTestDb(uri: string | undefined): asserts uri is string {
  if (!uri || !TEST_DB_PATTERN.test(uri)) {
    throw new Error(`[int] refusing to run: DATABASE_URI must be a local *_test database (got "${uri ?? ''}")`)
  }
}
