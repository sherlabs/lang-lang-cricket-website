import { describe, expect, it } from 'vitest'
import { allowSeedFallbacks, assertClubEnv } from '../config/site'

const full = { PLAYHQ_ORG_ID: 'org', PLAYHQ_TEAM_PREFIX: 'Club', CANONICAL_HOST: 'club.example', COOKIE_PREFIX: 'club' }

describe('assertClubEnv', () => {
  it('throws in production naming every missing value', () => {
    expect(() => assertClubEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toThrow(/PLAYHQ_ORG_ID, PLAYHQ_TEAM_PREFIX, CANONICAL_HOST, COOKIE_PREFIX/)
    expect(() => assertClubEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production', ...full, CANONICAL_HOST: ' ' })).toThrow(/CANONICAL_HOST/)
  })
  it('passes in production when all three are set', () => {
    expect(() => assertClubEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production', ...full })).not.toThrow()
  })
  it('throws on a Vercel preview too (a second club must not call Lang Lang PlayHQ)', () => {
    expect(() => assertClubEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toThrow(/PLAYHQ_ORG_ID/)
  })
  it('throws on a self-hosted production server (no VERCEL_ENV) too', () => {
    expect(() => assertClubEnv({ NODE_ENV: 'production' })).toThrow(/PLAYHQ_ORG_ID/)
    expect(() => assertClubEnv({ NODE_ENV: 'production', ...full })).not.toThrow()
  })
  it('passes in development and test with nothing set (Lang Lang dev and test defaults)', () => {
    for (const e of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { NODE_ENV: 'development', VERCEL_ENV: 'development' }]) expect(() => assertClubEnv(e)).not.toThrow()
  })
  it('allows the Lang Lang fallbacks only in development and test', () => {
    expect(allowSeedFallbacks({ NODE_ENV: 'development' })).toBe(true)
    expect(allowSeedFallbacks({ NODE_ENV: 'test' })).toBe(true)
    expect(allowSeedFallbacks({ NODE_ENV: 'production' })).toBe(false)
    expect(allowSeedFallbacks({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(false)
    expect(allowSeedFallbacks({})).toBe(false)
  })
})
