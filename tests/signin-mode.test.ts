import { describe, expect, it } from 'vitest'
import { computeSignIn, isStoredMode, type StoredMode } from '../lib/signin/mode'

const SERVER = 'https://club.example'
const BROKER = { AUTH_BROKER_ORIGIN: 'https://broker.example', AUTH_BROKER_CLUB_ID: 'demo-club' }
const OWN = { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }
const mode = (stored: StoredMode, env: Record<string, string>, host: string | null | undefined = 'club.example') => computeSignIn({ stored, env, serverURL: SERVER, host })

describe('effective sign-in mode', () => {
  it('stored off is off whatever the env', () => {
    expect(mode('off', { ...BROKER, ...OWN }).kind).toBe('off')
  })
  it('stored broker with both broker settings is broker', () => {
    expect(mode('broker', BROKER)).toEqual({ kind: 'broker', stored: 'broker' })
    expect(mode('broker', { ...BROKER, ...OWN }).kind).toBe('broker')
  })
  it("stored broker with no broker settings but the club's own app falls back to own-app, with a reason", () => {
    const m = mode('broker', OWN)
    expect(m.kind).toBe('own-app')
    expect(m.reason).toMatch(/own Facebook app because the shared broker is not set up/)
  })
  it('stored broker with no settings at all is off, with a reason', () => {
    const m = mode('broker', {})
    expect(m.kind).toBe('off')
    expect(m.reason).toMatch(/not set/)
  })
  it('stored own-app needs the own-app settings: the broker settings alone give off', () => {
    expect(mode('own-app', OWN).kind).toBe('own-app')
    expect(mode('own-app', BROKER).kind).toBe('off')
    expect(mode('own-app', { FACEBOOK_APP_ID: '1' }).kind).toBe('off')
  })
  it('a bad broker address counts as not set up', () => {
    expect(mode('broker', { AUTH_BROKER_ORIGIN: 'http://broker.example', AUTH_BROKER_CLUB_ID: 'x' }).kind).toBe('off')
    expect(mode('broker', { AUTH_BROKER_ORIGIN: 'http://broker.example', AUTH_BROKER_CLUB_ID: 'x', ...OWN }).kind).toBe('own-app')
  })
  it('the wrong host downgrades every non-off row to off', () => {
    for (const [stored, env] of [['broker', BROKER], ['broker', OWN], ['own-app', OWN]] as const) {
      expect(mode(stored, env, 'preview-1.vercel.app').kind).toBe('off')
      expect(mode(stored, env, null).kind).toBe('off')
    }
    expect(mode('broker', BROKER, 'preview-1.vercel.app').reason).toMatch(/not the website address/)
  })
  it('no host given (the admin page) skips the host rule', () => {
    expect(mode('broker', BROKER, undefined).kind).toBe('broker')
  })
  it('only the three known values are stored modes', () => {
    expect(['off', 'broker', 'own-app'].every(isStoredMode)).toBe(true)
    expect(isStoredMode('both')).toBe(false)
  })
})
