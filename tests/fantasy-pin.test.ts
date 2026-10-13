import { describe, expect, it } from 'vitest'
import { checkNewPin, deviceCodeExpiry, hashDeviceCode, isBannedPin, looksLikeFantasyPin, newDeviceCode, temporaryPin } from '../lib/fantasy/pin'

const SECRET = 'a-test-secret-of-some-length-1234567'

describe('fantasy PINs', () => {
  it('are exactly six digits', () => {
    expect(checkNewPin('483917', '483917')).toEqual({ ok: true, pin: '483917' })
    for (const bad of ['4839', '48391', '4839171', 'abcdef', '48 917', '', null, undefined, 483917]) expect(checkNewPin(bad as never, bad as never).ok, String(bad)).toBe(false)
  })
  it('must be typed twice the same', () => expect(checkNewPin('483917', '483918')).toEqual({ ok: false, message: 'The two PINs do not match.' }))
  it('bans repeats, runs, doubled halves and the favourites', () => {
    for (const p of ['000000', '111111', '123456', '654321', '012345', '123123', '121212', '112233', '696969', '246810', '456456']) expect(isBannedPin(p), p).toBe(true)
    for (const p of ['483917', '730264', '908153']) expect(isBannedPin(p), p).toBe(false)
    expect(checkNewPin('123456', '123456')).toEqual({ ok: false, message: 'Choose a PIN that is hard to guess.' })
  })
  it('a sign-in PIN only needs the shape', () => {
    expect(looksLikeFantasyPin('123456')).toBe(true)
    expect(looksLikeFantasyPin('12345')).toBe(false)
    expect(looksLikeFantasyPin(123456)).toBe(false)
  })
  it('a temporary PIN is six digits and not banned', () => {
    for (let i = 0; i < 200; i++) {
      const p = temporaryPin()
      expect(p).toMatch(/^\d{6}$/)
      expect(isBannedPin(p)).toBe(false)
    }
  })
})

describe('add-a-device codes', () => {
  it('are six digits and stored only as a keyed hash', () => {
    const c = newDeviceCode()
    expect(c).toMatch(/^\d{6}$/)
    const h = hashDeviceCode(c, SECRET)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(c)
    expect(hashDeviceCode(` ${c} `, SECRET)).toBe(h)
    expect(hashDeviceCode('000001', SECRET)).not.toBe(hashDeviceCode('000002', SECRET))
  })
  it('expire after ten minutes', () => {
    const now = new Date('2025-10-10T00:00:00Z')
    expect(deviceCodeExpiry(now).getTime() - now.getTime()).toBe(10 * 60_000)
  })
})
