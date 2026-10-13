import { describe, expect, it } from 'vitest'
import { assertClubPreset } from '../config/site'

const LL_HOST = 'langlangcricketclub.com'

describe('assertClubPreset', () => {
  it('throws on the Lang Lang host when CLUB_PRESET is missing or different', () => {
    expect(() => assertClubPreset({ CANONICAL_HOST: LL_HOST })).toThrow(/CLUB_PRESET/)
    expect(() => assertClubPreset({ CANONICAL_HOST: LL_HOST, CLUB_PRESET: 'template' })).toThrow(/"template"/)
    expect(() => assertClubPreset({ CANONICAL_HOST: LL_HOST, CLUB_PRESET: '' })).toThrow()
  })

  it('treats the www form of the host as the same host', () => {
    expect(() => assertClubPreset({ CANONICAL_HOST: `www.${LL_HOST}` })).toThrow()
    expect(() => assertClubPreset({ CANONICAL_HOST: LL_HOST.toUpperCase() })).toThrow()
  })

  it('passes with the right preset', () => {
    expect(() => assertClubPreset({ CANONICAL_HOST: LL_HOST, CLUB_PRESET: 'lang-lang' })).not.toThrow()
  })

  it('does not apply to any other host or an unset host', () => {
    expect(() => assertClubPreset({ CANONICAL_HOST: 'riverbend-cc.example' })).not.toThrow()
    expect(() => assertClubPreset({ CANONICAL_HOST: 'riverbend-cc.example', CLUB_PRESET: 'template' })).not.toThrow()
    expect(() => assertClubPreset({})).not.toThrow()
  })
})
