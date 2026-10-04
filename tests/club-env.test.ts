import { describe, expect, it } from 'vitest'
import { assertClubEnv } from '../config/site'

const full = { PLAYHQ_ORG_ID: 'org', PLAYHQ_TEAM_PREFIX: 'Club', CANONICAL_HOST: 'club.example' }

describe('assertClubEnv', () => {
  it('throws in production naming every missing value', () => {
    expect(() => assertClubEnv({ VERCEL_ENV: 'production' })).toThrow(/PLAYHQ_ORG_ID, PLAYHQ_TEAM_PREFIX, CANONICAL_HOST/)
    expect(() => assertClubEnv({ VERCEL_ENV: 'production', ...full, CANONICAL_HOST: ' ' })).toThrow(/CANONICAL_HOST/)
  })
  it('passes in production when all three are set', () => {
    expect(() => assertClubEnv({ VERCEL_ENV: 'production', ...full })).not.toThrow()
  })
  it('passes everywhere else with nothing set (Lang Lang dev and test defaults)', () => {
    for (const e of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) expect(() => assertClubEnv(e)).not.toThrow()
  })
})
