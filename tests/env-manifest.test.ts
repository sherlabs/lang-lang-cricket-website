import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkEnv, ENV_MANIFEST, envChecklistMarkdown, envProblems, manifestMarkdown } from '../config/env-manifest'

describe('checkEnv', () => {
  it('reports missing, invalid and set without ever returning a value', () => {
    const secret = 'postgres://user:SuperSecretPw@host.example/db'
    const reports = checkEnv({ DATABASE_URI: secret, PAYLOAD_SECRET: 'short', CANONICAL_HOST: 'https://bad/host', COOKIE_PREFIX: 'rb' })
    const by = Object.fromEntries(reports.map((r) => [r.name, r.status]))
    expect(by.DATABASE_URI).toBe('set')
    expect(by.PAYLOAD_SECRET).toBe('invalid')
    expect(by.CANONICAL_HOST).toBe('invalid')
    expect(by.COOKIE_PREFIX).toBe('set')
    expect(by.CRON_SECRET).toBe('missing')
    expect(by.EMAIL_PROVIDER).toBe('default')
    expect(JSON.stringify(reports)).not.toContain('SuperSecretPw')
    expect(JSON.stringify(reports)).not.toContain('short')
  })

  it('problems are required-and-missing or invalid', () => {
    const names = envProblems(checkEnv({ PAYLOAD_SECRET: 'x' })).map((r) => r.name)
    expect(names).toContain('PAYLOAD_SECRET')
    expect(names).toContain('DATABASE_URI')
    expect(names).not.toContain('EMAIL_PROVIDER')
  })

  it('a fully configured environment has no problems', () => {
    const env: Record<string, string> = {
      DATABASE_URI: 'postgres://u:p@h/db',
      DATABASE_URI_UNPOOLED: 'postgres://u:p@h/db',
      PAYLOAD_SECRET: 'x'.repeat(40),
      PROD_DATABASE_HOST: 'db.example.net',
      CRON_SECRET: 'y'.repeat(40),
      BLOB_READ_WRITE_TOKEN: 'token',
      CANONICAL_HOST: 'riverbend-cc.example',
      COOKIE_PREFIX: 'rb',
      PLAYHQ_ORG_ID: '00000000-0000-0000-0000-000000000000',
      PLAYHQ_TEAM_PREFIX: 'Riverbend',
      CLUB_TIMEZONE: 'Australia/Sydney',
      CLUB_LOCALE: 'en-AU',
      SEASON_START_MONTH: '7',
    }
    expect(envProblems(checkEnv(env))).toEqual([])
  })
})

describe('the manifest and its consumers', () => {
  it('has unique names', () => {
    const names = ENV_MANIFEST.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('the generated checklist covers every manifest entry and carries no values', () => {
    const md = envChecklistMarkdown('Riverbend Cricket Club', { CRON_SECRET: 'SECRET-VALUE-123456789012345678901234567890' })
    for (const e of ENV_MANIFEST) expect(md).toContain(`\`${e.name}\``)
    expect(md).not.toContain('SECRET-VALUE')
  })

  it('docs/template/new-club-checklist.md carries the manifest table verbatim', () => {
    const doc = readFileSync(path.resolve(__dirname, '../docs/template/new-club-checklist.md'), 'utf8')
    expect(doc).toContain(manifestMarkdown())
  })
})
