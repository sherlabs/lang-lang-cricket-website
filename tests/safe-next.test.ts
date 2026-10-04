import { describe, expect, it } from 'vitest'
import { safeNext } from '../lib/safe-next'

describe('safeNext (open-redirect table)', () => {
  const ok: Array<[string, string]> = [
    ['/selector', '/selector'],
    ['/selector/', '/selector/'],
    ['/selector/teams', '/selector/teams'],
    ['/selector/teams/123?tab=squad', '/selector/teams/123?tab=squad'],
    ['%2Fselector%2Fteams', '/selector/teams'],
  ]
  for (const [input, want] of ok) it(`keeps ${input}`, () => expect(safeNext(input)).toBe(want))

  const bad = [
    'https://evil.example/selector',
    '//evil.example',
    '/\\evil.example',
    '/selector//evil.example',
    '/selector/%2fevil',
    '/selector%5cevil',
    '/selector\\evil',
    '/selector%00',
    '/selector\n/x',
    '/selector%0d%0aSet-Cookie:x=1',
    '%252Fselector',
    '%2F%2Fevil.example',
    'javascript:alert(1)',
    'data:text/html,x',
    '/selectorx',
    '/admin',
    '/',
    '',
    'selector',
    '/selector/../admin',
    '/selector/%2e%2e/admin',
    '/selector/a:b@evil.example',
    `/selector/${'a'.repeat(400)}`,
    '/selector#frag',
    '/selector/<script>',
  ]
  for (const input of bad) it(`falls back for ${JSON.stringify(input.slice(0, 40))}`, () => expect(safeNext(input)).toBe('/selector'))

  it('uses the given fallback, and handles non-strings', () => {
    expect(safeNext('https://x.test', '/selector/account')).toBe('/selector/account')
    expect(safeNext(null)).toBe('/selector')
    expect(safeNext(undefined)).toBe('/selector')
    expect(safeNext(['/selector'])).toBe('/selector')
  })
})
