import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/club', () => ({ getClub: async () => ({ siteUrl: 'https://club.test' }) }))

describe('robots', () => {
  it('allows the player stat cards (longest match beats /api) and blocks the compare tool and the StatLab export', async () => {
    const { default: robots } = await import('@/app/robots')
    const r = await robots()
    const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules) as { allow: string[]; disallow: string[] }
    expect(rule.allow).toContain('/api/public/players/')
    expect(rule.disallow).toContain('/api')
    expect(rule.disallow).toContain('/players/compare$')
    expect(rule.disallow).toContain('/players/compare?')
    expect(rule.disallow).toContain('/statlab/export')
    expect(rule.disallow).toContain('/preview')
    // The fantasy join link (a bearer token) and the per-person team page are never crawled.
    expect(rule.disallow).toContain('/fantasy/play/')
    expect(rule.disallow).toContain('/fantasy/team')
    expect(r.sitemap).toBe('https://club.test/sitemap.xml')
  })
})
