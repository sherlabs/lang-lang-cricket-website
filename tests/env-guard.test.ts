import { describe, expect, it } from 'vitest'
import { FAKE_BLOB_STORE_ID, assertLocalDb, assertSafeEnv, blobToken, csrfOrigins, isLocalDbUrl, resolveServerURL } from '@/payload/env'
import { checkGuard } from '@/payload/scripts/_guard'

const LOCAL = 'postgres://postgres:postgres@127.0.0.1:54329/langlang_dev'
const REMOTE = 'postgres://u:p@ep-x-pooler.ap-southeast-2.aws.neon.tech/neondb'

describe('assertSafeEnv', () => {
  it('passes for a local DB without a Blob token', () => {
    expect(() => assertSafeEnv({ DATABASE_URI: LOCAL })).not.toThrow()
    expect(() => assertSafeEnv({ DATABASE_URI: 'postgres://a:b@localhost:5432/x' })).not.toThrow()
  })

  it('throws for a remote DATABASE_URI, including under NODE_ENV=production', () => {
    expect(() => assertSafeEnv({ DATABASE_URI: REMOTE })).toThrow(/not local/)
    expect(() => assertSafeEnv({ DATABASE_URI: REMOTE, NODE_ENV: 'production' })).toThrow(/not local/)
  })

  it('allows a remote DB only with ALLOW_REMOTE_DB=yes', () => {
    expect(() => assertSafeEnv({ DATABASE_URI: REMOTE, ALLOW_REMOTE_DB: 'yes' })).not.toThrow()
    expect(() => assertSafeEnv({ DATABASE_URI: REMOTE, ALLOW_REMOTE_DB: 'true' })).toThrow()
  })

  it('throws for any BLOB_READ_WRITE_TOKEN without ALLOW_REMOTE_BLOB=yes', () => {
    expect(() => assertSafeEnv({ DATABASE_URI: LOCAL, BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b' })).toThrow(/BLOB_READ_WRITE_TOKEN/)
    expect(() =>
      assertSafeEnv({ DATABASE_URI: LOCAL, BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b', NODE_ENV: 'production' }),
    ).toThrow(/BLOB_READ_WRITE_TOKEN/)
    expect(() => assertSafeEnv({ DATABASE_URI: LOCAL, BLOB_READ_WRITE_TOKEN: 'x', ALLOW_REMOTE_BLOB: 'yes' })).not.toThrow()
  })

  it('passes on Vercel', () => {
    expect(() => assertSafeEnv({ VERCEL: '1', DATABASE_URI: REMOTE, BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b' })).not.toThrow()
  })

  it('checks a named variable (transitional db/ uses LEGACY_DATABASE_URL)', () => {
    expect(() => assertSafeEnv({ LEGACY_DATABASE_URL: REMOTE }, 'LEGACY_DATABASE_URL')).toThrow(/LEGACY_DATABASE_URL/)
  })
})

describe('host query parameter (pg lets ?host= override the URL host)', () => {
  const sneaky = `${LOCAL}?host=ep-x.neon.tech`
  it('isLocalDbUrl / assertSafeEnv / assertLocalDb treat it as remote', () => {
    expect(isLocalDbUrl(sneaky)).toBe(false)
    expect(isLocalDbUrl(`${LOCAL}?hostaddr=10.0.0.5`)).toBe(false)
    expect(isLocalDbUrl(`${LOCAL}?host=127.0.0.1,ep-x.neon.tech`)).toBe(false)
    expect(isLocalDbUrl(`${LOCAL}?host=localhost&sslmode=disable`)).toBe(true)
    expect(() => assertSafeEnv({ DATABASE_URI: sneaky })).toThrow(/ep-x\.neon\.tech/)
    expect(() => assertSafeEnv({ LEGACY_DATABASE_URL: sneaky }, 'LEGACY_DATABASE_URL')).toThrow(/not local/)
    expect(() => assertLocalDb({ DATABASE_URI: sneaky })).toThrow()
  })
  it('the script guard targets the effective host and requires ALLOW_REMOTE_DB', () => {
    const env = { DATABASE_URI: sneaky }
    expect(() => checkGuard({ write: false }, ['--target', '127.0.0.1/langlang_dev'], env)).toThrow(/does not match/)
    expect(() => checkGuard({ write: false }, ['--target', 'ep-x.neon.tech/langlang_dev'], env)).toThrow(/ALLOW_REMOTE_DB/)
  })
})

describe('assertLocalDb', () => {
  it('only allows local hosts', () => {
    expect(assertLocalDb({ DATABASE_URI: LOCAL })).toBe(true)
    expect(() => assertLocalDb({ DATABASE_URI: REMOTE })).toThrow()
    expect(() => assertLocalDb({ DATABASE_URI: REMOTE, ALLOW_REMOTE_DB: 'yes' })).toThrow()
  })
})

describe('blobToken', () => {
  it('is undefined locally, fake with PAYLOAD_BLOB_FAKE=1, real on Vercel', () => {
    expect(blobToken({})).toBeUndefined()
    expect(blobToken({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_real_x' })).toBeUndefined()
    expect(blobToken({ PAYLOAD_BLOB_FAKE: '1' })).toMatch(new RegExp(`^vercel_blob_rw_${FAKE_BLOB_STORE_ID}_[a-z0-9]+$`, 'i'))
    expect(blobToken({ VERCEL: '1', PAYLOAD_BLOB_FAKE: '1', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_real_x' })).toBe('vercel_blob_rw_real_x')
  })
})

describe('resolveServerURL / csrfOrigins', () => {
  it('throws when NEXT_PUBLIC_SERVER_URL is missing', () => {
    expect(() => resolveServerURL({})).toThrow(/NEXT_PUBLIC_SERVER_URL/)
  })
  it('uses the variable, without a trailing slash', () => {
    expect(resolveServerURL({ NEXT_PUBLIC_SERVER_URL: 'https://example.com/' })).toBe('https://example.com')
  })
  it('derives preview URLs from Vercel system variables', () => {
    const env = { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'app-git-x.vercel.app', VERCEL_URL: 'app-abc.vercel.app' }
    const url = resolveServerURL(env)
    expect(url).toBe('https://app-git-x.vercel.app')
    expect(csrfOrigins(url, env)).toEqual(['https://app-git-x.vercel.app', 'https://app-abc.vercel.app'])
    expect(() => resolveServerURL({ VERCEL_ENV: 'preview' })).toThrow(/VERCEL_BRANCH_URL/)
  })
})

describe('script guard', () => {
  const env = { DATABASE_URI: LOCAL }
  it('requires --target equal to DATABASE_URI', () => {
    expect(() => checkGuard({ write: false }, [], env)).toThrow(/--target/)
    expect(() => checkGuard({ write: false }, ['--target', '127.0.0.1/other'], env)).toThrow(/does not match/)
    expect(checkGuard({ write: false }, ['--target', '127.0.0.1/langlang_dev'], env).db).toBe('langlang_dev')
  })
  it('requires --confirm for writes', () => {
    expect(() => checkGuard({ write: true }, ['--target', '127.0.0.1/langlang_dev'], env)).toThrow(/--confirm/)
    expect(checkGuard({ write: true }, ['--target', '127.0.0.1/langlang_dev', '--confirm'], env).confirmed).toBe(true)
  })
  it('requires ALLOW_REMOTE_DB=yes for a remote host', () => {
    const remote = { DATABASE_URI: 'postgres://u:p@db.example.com:5432/prod' }
    expect(() => checkGuard({ write: false }, ['--target', 'db.example.com/prod'], remote)).toThrow(/ALLOW_REMOTE_DB/)
    expect(checkGuard({ write: false }, ['--target', 'db.example.com/prod'], { ...remote, ALLOW_REMOTE_DB: 'yes' }).local).toBe(false)
  })
})
