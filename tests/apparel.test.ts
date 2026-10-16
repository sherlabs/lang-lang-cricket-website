import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ApparelBanner, ApparelLink } from '../components/apparel-link'
import { SiteFooter } from '../components/site-footer'
import { SiteNav } from '../components/site-nav'
import { resolveApparel, resolveClub } from '../lib/club-merge'
import { httpUrlOrEmpty } from '../payload/fields/validators'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

const URL_OK = 'https://shop.example.com.au/lang-lang'

describe('resolveApparel', () => {
  it('returns the link with the default label when only the URL is set', () => {
    expect(resolveApparel({ apparelUrl: URL_OK, apparelLabel: '', apparelBlurb: '' })).toEqual({ url: URL_OK, label: 'Club apparel', blurb: '' })
    expect(resolveApparel({ apparelUrl: ` ${URL_OK} `, apparelLabel: ' Shop the gear ', apparelBlurb: ' Order online ' })).toEqual({ url: URL_OK, label: 'Shop the gear', blurb: 'Order online' })
  })

  it('is null (nothing renders) when empty, missing, or not http(s)', () => {
    expect(resolveApparel(null)).toBeNull()
    expect(resolveApparel({})).toBeNull()
    expect(resolveApparel({ apparelUrl: '   ' })).toBeNull()
    expect(resolveApparel({ apparelUrl: 'javascript:alert(1)' })).toBeNull()
    expect(resolveApparel({ apparelUrl: 'ftp://x.test' })).toBeNull()
    expect(resolveApparel({ apparelUrl: 'not a url' })).toBeNull()
  })

  it('resolveClub carries it as club.apparel and defaults to null', () => {
    expect(resolveClub(null).apparel).toBeNull()
    expect(resolveClub(null, undefined, { apparelUrl: URL_OK }).apparel?.url).toBe(URL_OK)
  })
})

describe('apparelUrl validation (http/https only)', () => {
  it('accepts empty and http(s); rejects everything else', () => {
    expect(httpUrlOrEmpty('')).toBe(true)
    expect(httpUrlOrEmpty(undefined)).toBe(true)
    expect(httpUrlOrEmpty(URL_OK)).toBe(true)
    expect(httpUrlOrEmpty('http://shop.test')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'mailto:a@b.co', 'shop.example.com', 'ftp://x.test', 'data:text/html,hi']) {
      expect(httpUrlOrEmpty(bad)).not.toBe(true)
    }
  })
})

describe('rendering', () => {
  const apparel = { url: URL_OK, label: 'Club apparel', blurb: 'Order your club shirt online.' }
  const club = resolveClub(null)
  const nav = { club: { name: club.name, tagline: club.tagline, logoUrl: club.logoUrl }, primaryLinks: club.navigation.primaryNav, clubLinks: club.navigation.clubhouseNav, clubLabel: club.navigation.clubhouseLabel, cta: club.navigation.navCta }

  it('every placement opens in a new tab with noopener', () => {
    for (const variant of ['nav', 'mobile', 'footer', 'banner'] as const) {
      const html = renderToStaticMarkup(ApparelLink({ apparel, variant })!)
      expect(html).toContain(`href="${URL_OK}"`)
      expect(html).toContain('target="_blank"')
      expect(html).toMatch(/rel="noopener noreferrer"/)
      expect(html).toContain('Club apparel')
    }
  })

  it('the home banner shows the blurb and button; nothing without a link', () => {
    const html = renderToStaticMarkup(ApparelBanner({ apparel })!)
    expect(html).toContain('Order your club shirt online.')
    expect(html).toContain('bg-brand-gold')
    expect(ApparelBanner({ apparel: null })).toBeNull()
    expect(ApparelLink({ apparel: null, variant: 'nav' })).toBeNull()
  })

  it('the main nav renders the apparel link on desktop; no dead button when empty', () => {
    const withLink = renderToStaticMarkup(createElement(SiteNav, { ...nav, apparel }))
    expect(withLink).toContain('data-apparel="nav"')
    expect(withLink).toContain(URL_OK)
    const without = renderToStaticMarkup(createElement(SiteNav, { ...nav, apparel: null }))
    expect(without).not.toContain('data-apparel')
    expect(without).not.toContain('shop.example')
    expect(renderToStaticMarkup(createElement(SiteNav, nav))).not.toContain('data-apparel')
  })

  it('the footer renders it when set and omits it when empty', () => {
    expect(renderToStaticMarkup(createElement(SiteFooter, { club: { ...club, apparel } }))).toContain('data-apparel="footer"')
    expect(renderToStaticMarkup(createElement(SiteFooter, { club: { ...club, apparel: null } }))).not.toContain('data-apparel')
  })
})
