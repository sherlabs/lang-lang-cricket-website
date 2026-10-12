import { describe, expect, it } from 'vitest'
import { refererInAdmin } from '@/lib/office/referer'

describe('refererInAdmin', () => {
  it('keeps an admin page on the same host and drops flash params', () => {
    expect(refererInAdmin('https://club.test/admin/office/fees?season=2026&notice=paid&n=2', 'club.test', '/admin')).toBe('/admin/office/fees?season=2026')
  })
  it('refuses a foreign host, a page outside the admin and junk', () => {
    expect(refererInAdmin('https://evil.test/admin/office', 'club.test', '/admin')).toBeNull()
    expect(refererInAdmin('https://club.test/administrator', 'club.test', '/admin')).toBeNull()
    expect(refererInAdmin('https://club.test/news', 'club.test', '/admin')).toBeNull()
    expect(refererInAdmin('not a url', 'club.test', '/admin')).toBeNull()
    expect(refererInAdmin(null, 'club.test', '/admin')).toBeNull()
  })
})
