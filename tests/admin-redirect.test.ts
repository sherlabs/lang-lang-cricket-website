import { describe, expect, it } from 'vitest'
import { adminReturnPath, allowlistedQuery, loginRedirectUrl, queryKeysFor } from '@/lib/admin/redirect'

const back = (url: string) => decodeURIComponent(url.split('redirect=')[1] ?? '')

describe('admin login redirect builder', () => {
  it('keeps the full deep link of the Social composer', () => {
    const url = loginRedirectUrl({ adminRoute: '/admin', viewPath: '/social', query: { type: 'sponsor-thanks', source: '13,17', style: 'bold', size: 'landscape' } })
    expect(url.startsWith('/admin/login?redirect=')).toBe(true)
    expect(back(url)).toBe('/admin/social?type=sponsor-thanks&source=13%2C17&style=bold&size=landscape')
  })

  it('uses the configured admin route, never a literal', () => {
    expect(loginRedirectUrl({ adminRoute: '/committee', viewPath: '/social' })).toBe('/committee/login?redirect=%2Fcommittee%2Fsocial')
  })

  it('drops keys the view does not declare, including flash messages', () => {
    expect(allowlistedQuery({ type: 'result', notice: 'saved', error: 'x', evil: '1' }, queryKeysFor('/social'))).toBe('?type=result')
    expect(queryKeysFor('/office/fees/member/3')).toEqual(queryKeysFor('/office/fees'))
    expect(queryKeysFor('/help')).toEqual([])
  })

  it('caps each value at 500 characters and the whole query at 2000', () => {
    const q = allowlistedQuery({ text: 'a'.repeat(900) }, ['text'])
    expect(q.length).toBe('?text='.length + 500)
    const many = Object.fromEntries(['type', 'source', 'style', 'size', 'text', 'tab', 'post'].map((k) => [k, 'b'.repeat(500)]))
    expect(allowlistedQuery(many, queryKeysFor('/social'))).toBe('') // 3500+ characters: too long to carry, so none is carried
  })

  it('removes control characters (CR/LF cannot split a header)', () => {
    const url = loginRedirectUrl({ adminRoute: '/admin', viewPath: '/social', query: { text: 'hi\r\nSet-Cookie: x=1' } })
    expect(url).not.toMatch(/%0[ad]/i)
    expect(url).not.toMatch(/[\r\n]/)
  })

  const hostile = ['//evil.test', '/\\evil.test', '\\\\evil.test', 'javascript:alert(1)', '%2F%2Fevil.test', 'https://evil.test']
  it.each(hostile)('a hostile query value (%s) only ever stays inside the encoded query of an admin path', (value) => {
    const path = adminReturnPath({ adminRoute: '/admin', viewPath: '/social', query: { text: value, type: value } })
    expect(path.startsWith('/admin/social')).toBe(true)
    const url = new URL(path, 'http://localhost')
    expect(url.origin).toBe('http://localhost')
    expect(url.pathname).toBe('/admin/social')
  })

  it.each(['/admin/../evil', '//evil.test', '/\\evil.test', '/../x', '/a//b'])('a hostile view path (%s) falls back to the admin home', (viewPath) => {
    expect(adminReturnPath({ adminRoute: '/admin', viewPath })).toBe('/admin')
  })

  it('an unsafe admin route is replaced by the default admin route', () => {
    expect(adminReturnPath({ adminRoute: '//evil.test', viewPath: '/social' })).toBe('/admin/social')
  })
})
