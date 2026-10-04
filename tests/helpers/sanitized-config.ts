import type { SanitizedConfig } from 'payload'

/**
 * The real, sanitized Payload config for unit tests that need it (e.g. the Lexical editor
 * config of `htmlToLexical`). Building it never opens a database connection; the env values
 * are local placeholders so the config's env guards pass. No Blob token.
 */
export async function loadSanitizedConfig(): Promise<SanitizedConfig> {
  process.env.DATABASE_URI ??= 'postgres://postgres:postgres@127.0.0.1:54329/unit_never_connects'
  process.env.PAYLOAD_SECRET ??= 'unit-test-secret'
  process.env.NEXT_PUBLIC_SERVER_URL ??= 'http://localhost:3000'
  delete process.env.BLOB_READ_WRITE_TOKEN
  const mod = await import('@payload-config')
  return mod.default
}
