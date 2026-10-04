import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { isLocalDbUrl } from '../../payload/env'

/** Only a local *_test database may ever be used by the int project (spec §15). */
export const TEST_DB_NAME_PATTERN = /^\/[a-z_]+_test$/

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
    // The statlab export filename test expects Lang Lang's prefix (config/site.ts).
    EXPORT_FILENAME_PREFIX: 'langlang',
    // Never a real token in tests; files the plugin would store go through PAYLOAD_BLOB_FAKE + mocks.
    BLOB_READ_WRITE_TOKEN: '',
  }
}

/**
 * Every host pg could connect to must be local (isLocalDbUrl also covers ?host= / ?hostaddr=),
 * and the parsed database name — not a regex over the raw string — must end in _test.
 */
export function isTestDbUrl(uri: string | undefined): boolean {
  if (!uri) return false
  try {
    const parsed = new URL(uri)
    return /^postgres(ql)?:$/.test(parsed.protocol) && isLocalDbUrl(uri) && TEST_DB_NAME_PATTERN.test(parsed.pathname)
  } catch {
    return false
  }
}

export function assertTestDb(uri: string | undefined): asserts uri is string {
  if (!isTestDbUrl(uri)) {
    throw new Error(`[int] refusing to run: DATABASE_URI must be a local *_test database (got "${uri ?? ''}")`)
  }
}
