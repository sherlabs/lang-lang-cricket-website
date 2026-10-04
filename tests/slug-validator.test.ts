import { describe, expect, it } from 'vitest'
import { httpUrlOrPath, isHttpUrlOrPath, isValidSlug, slugValidator } from '../payload/fields/validators'
import { makeUniqueSlug } from '../lib/slugify'

describe('isValidSlug', () => {
  it.each(['about', 'join-the-club', 'u12-2026', 'a', '2026'])('accepts %s', (s) => expect(isValidSlug(s)).toBe(true))
  it.each(['', 'About', 'a b', 'a_b', '-a', 'a-', 'a--b', 'a/b', 'é', 'a.b', 'index', 5, null, undefined])('rejects %s', (s) => expect(isValidSlug(s)).toBe(false))
})

describe('slugValidator', () => {
  it('lets an empty value through (generated from the title on create)', () => {
    expect(slugValidator('')).toBe(true)
    expect(slugValidator(undefined)).toBe(true)
    expect(slugValidator(null)).toBe(true)
  })
  it('accepts a good slug and rejects bad characters and index with a plain message', () => {
    expect(slugValidator('join-us')).toBe(true)
    expect(slugValidator('Join Us')).toMatch(/lowercase letters/)
    expect(slugValidator('index')).toMatch(/index/)
  })
  it('is skipped under the ETL', () => {
    expect(slugValidator('Legacy Slug', { req: { context: { etl: true } } })).toBe(true)
  })
})

describe('call-to-action link validator', () => {
  it.each(['/contact', '/info/about-the-club?x=1', 'https://example.com/a', 'http://example.com'])('accepts %s', (u) => {
    expect(isHttpUrlOrPath(u)).toBe(true)
    expect(httpUrlOrPath(u)).toBe(true)
  })
  it.each(['', 'javascript:alert(1)', 'mailto:a@b.co', '//evil.example', '/\\evil', 'contact', 'ftp://x.y', '/a b', 'data:text/html,x', null, 5])('rejects %s', (u) => {
    expect(isHttpUrlOrPath(u)).toBe(false)
    expect(httpUrlOrPath(u)).toMatch(/Enter a full link/)
  })
})

describe('makeUniqueSlug with a reserved set', () => {
  it('treats only the given words as taken (pages reserve index, not submit)', async () => {
    const none = async () => false
    expect(await makeUniqueSlug('Index', none, new Set(['index']))).toBe('index-2')
    expect(await makeUniqueSlug('Submit', none, new Set(['index']))).toBe('submit')
    expect(await makeUniqueSlug('Submit', none)).toBe('submit-2')
  })
})
