import { describe, expect, it } from 'vitest'
import { formatPhone, lastFour, normalisePhone, telHref } from '../lib/selection/phone'
import { dummyVerify, hashOneTimeCode, hashPin, looksLikePin, newOneTimeCode, validPin, verifyPin } from '../lib/selection/pin'

const S = 'a-test-secret-of-some-length-1234567'

describe('normalisePhone', () => {
  it('reads Australian numbers in every common spelling', () => {
    for (const raw of ['0400 000 001', '0400-000-001', '(0400) 000 001', '+61 400 000 001', '61400000001', '0061400000001', '400 000 001']) {
      expect(normalisePhone(raw, 'AU'), raw).toBe('0400000001')
    }
  })
  it('refuses implausible numbers', () => {
    for (const raw of ['', 'abc', '12345', '0400 000', '04000000011', '0400 000 001 ext 4'.repeat(4)]) expect(normalisePhone(raw, 'AU'), raw).toBeNull()
    expect(normalisePhone(undefined, 'AU')).toBeNull()
  })
  it('is permissive (digits only, 6 to 15) for a country with no rule', () => {
    expect(normalisePhone('+1 (555) 010-9999', 'US')).toBe('15550109999')
    expect(normalisePhone('123', 'US')).toBeNull()
    expect(normalisePhone('1'.repeat(16), '')).toBeNull()
  })
  it('formats for display and exposes the last four digits and a tel link', () => {
    expect(formatPhone('0400000001', 'AU')).toBe('0400 000 001')
    expect(formatPhone('15550109999', 'US')).toBe('15550109999')
    expect(lastFour('0400000001')).toBe('0001')
    expect(lastFour('123')).toBeNull()
    expect(telHref('0400000001')).toBe('tel:0400000001')
    expect(telHref(null)).toBeNull()
  })
})

describe('pin', () => {
  it('hashes with a per-row salt and verifies in constant shape', async () => {
    const a = await hashPin('1234', S)
    const b = await hashPin('1234', S)
    expect(a.hash).not.toBe(b.hash)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyPin('1234', { hash: a.hash, salt: a.salt }, S)).toBe(true)
    expect(await verifyPin('1235', { hash: a.hash, salt: a.salt }, S)).toBe(false)
  })
  it('a different pepper (secret) never verifies', async () => {
    const a = await hashPin('1234', S)
    expect(await verifyPin('1234', a, 'another-secret-of-some-length-12345678')).toBe(false)
  })
  it('a missing, malformed or dummy hash never verifies', async () => {
    expect(await verifyPin('1234', null, S)).toBe(false)
    expect(await verifyPin('1234', { hash: 'zz', salt: 'zz' }, S)).toBe(false)
    expect(await dummyVerify('1234', S)).toBe(false)
  })
  it('a missing hash costs about as much as a real check', async () => {
    const real = await hashPin('1234', S)
    const time = async (f: () => Promise<unknown>) => {
      const t = process.hrtime.bigint()
      await f()
      return Number(process.hrtime.bigint() - t) / 1e6
    }
    const t1 = await time(() => verifyPin('0000', real, S))
    const t2 = await time(() => dummyVerify('0000', S))
    expect(t2).toBeGreaterThan(t1 / 4)
  })
  it('accepts only 4 to 6 digits as a manual PIN', () => {
    expect(validPin('1234')).toBe('1234')
    expect(validPin(' 123456 ')).toBe('123456')
    for (const bad of ['123', '1234567', '12a4', '', '12 34', null, 1234]) expect(validPin(bad as never), String(bad)).toBeNull()
  })
  it('tells a PIN from a one-time code', () => {
    expect(looksLikePin('1234')).toBe(true)
    expect(looksLikePin('abcd2345')).toBe(false)
    for (let i = 0; i < 3000; i++) expect(looksLikePin(newOneTimeCode())).toBe(false)
    const code = newOneTimeCode()
    expect(code).toMatch(/^[a-z2-9]{8}$/)
    expect(hashOneTimeCode(code.toUpperCase(), S)).toBe(hashOneTimeCode(` ${code} `, S))
    expect(hashOneTimeCode(code, S)).not.toBe(hashOneTimeCode(newOneTimeCode(), S))
  })
})
