import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminNavUser } from '@/payload/components/AdminNavUser'
import { AuthTroubleNotice, NoAccessNotice } from '@/payload/components/AdminNotices'
import { Button, LinkButton } from '@/payload/components/ui/Button'
import { Card, Section } from '@/payload/components/ui/Card'
import { Disclosure } from '@/payload/components/ui/Disclosure'
import { EmptyState } from '@/payload/components/ui/EmptyState'
import { Icon } from '@/payload/components/ui/Icon'
import { PageHeader } from '@/payload/components/ui/PageHeader'
import { Skeleton, SkeletonRows } from '@/payload/components/ui/Skeleton'
import { StatusPill } from '@/payload/components/ui/StatusPill'

// createElement with the children as trailing arguments, loosely typed: the kit components are JSX-shaped and this file is plain TS.
const h = createElement as unknown as (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => ReactElement
const html = (node: ReactElement) => renderToStaticMarkup(node)

describe('admin component kit', () => {
  it('Button: a real button, busy sets aria-busy and blocks clicks, the label stays', () => {
    const idle = html(h(Button, null, 'Save'))
    expect(idle).toContain('<button type="button"')
    expect(idle).not.toContain('aria-busy')
    const busy = html(h(Button, { busy: true, variant: 'secondary' }, 'Save'))
    expect(busy).toContain('aria-busy="true"')
    expect(busy).toContain('disabled=""')
    expect(busy).toContain('>Save<')
    expect(busy).toContain('ui-btn--secondary')
  })

  it('LinkButton: a link with the button look and an accessible name from its text', () => {
    const out = html(h(LinkButton, { href: '/admin/help', variant: 'quiet' }, 'Open help'))
    expect(out).toMatch(/^<a class="ui-btn ui-btn--quiet" href="\/admin\/help">Open help<\/a>$/)
  })

  it('StatusPill: always carries words, never colour alone; the count variant names what it counts', () => {
    const pill = html(h(StatusPill, { tone: 'ok' }, 'Showing on the website'))
    expect(pill).toContain('ui-pill--ok')
    expect(pill).toContain('Showing on the website')
    const withIcon = html(h(StatusPill, { tone: 'warn', icon: 'alert' }, 'Hidden'))
    expect(withIcon).toContain('aria-hidden="true"') // the glyph is decorative; the word is the content
    expect(withIcon).toContain('Hidden')
    const count = html(h(StatusPill, { tone: 'accent', label: '3 waiting' }, 3))
    expect(count).toContain('aria-label="3 waiting"')
  })

  it('PageHeader: exactly one h1 in the display font, plus lead, action and back link when given', () => {
    const out = html(h(PageHeader, { title: 'Players', lead: 'Everyone who plays for the club.', action: h(LinkButton, { href: '/x' }, 'Add a player'), back: { href: '/admin', label: 'Back to Home' } }))
    expect(out.match(/<h1/g)).toHaveLength(1)
    expect(out).toContain('admin-display')
    expect(out).toContain('Everyone who plays for the club.')
    expect(out).toContain('Add a player')
    expect(out).toContain('Back to Home')
    expect(html(h(PageHeader, { title: 'Only a title' }))).not.toContain('ui-page-header__lead')
  })

  it('Section: the region is labelled by its own heading', () => {
    const out = html(h(Section, { id: 'stories', title: 'Stories', action: h('span', null, 'x') }, h('p', null, 'body')))
    expect(out).toContain('id="stories"')
    expect(out).toContain('aria-labelledby="stories-title"')
    expect(out).toContain('<h2 id="stories-title"')
  })

  it('Card: tone classes and a custom element', () => {
    expect(html(h(Card, { tone: 'tint', as: 'li' }, 'x'))).toMatch(/^<li class="ui-card ui-card--tint"/)
    expect(html(h(Card, null, 'x'))).toBe('<div class="ui-card">x</div>')
  })

  it('EmptyState: one sentence and an action only when given', () => {
    expect(html(h(EmptyState, null, 'Nothing is waiting.'))).not.toContain('ui-empty__action')
    expect(html(h(EmptyState, { action: h(LinkButton, { href: '/y' }, 'Add one') }, 'No players yet.'))).toContain('Add one')
  })

  it('Skeleton: decorative blocks; SkeletonRows announces one polite "Loading"', () => {
    expect(html(h(Skeleton, { width: '10rem' }))).toContain('aria-hidden="true"')
    const rows = html(h(SkeletonRows, { rows: 3 }))
    expect(rows).toContain('role="status"')
    expect(rows).toContain('aria-busy="true"')
    expect(rows.match(/ui-skel"/g)).toHaveLength(3)
    expect(rows).toContain('Loading')
  })

  it('Disclosure: native details, closed unless asked, summary is the control', () => {
    const closed = html(h(Disclosure, { summary: 'More' }, 'inside'))
    expect(closed).toMatch(/^<details class="ui-disclosure"><summary class="ui-disclosure__summary">More<\/summary>/)
    expect(closed).not.toContain(' open')
    expect(html(h(Disclosure, { summary: 'More', open: true }, 'inside'))).toContain('open=""')
  })

  it('Icon: decorative, from the registry', () => {
    expect(html(h(Icon, { name: 'home' }))).toContain('aria-hidden="true"')
  })

  it('the sidebar footer shows the person in plain words and a labelled Sign out, never the raw role', () => {
    const payload = { config: { routes: { admin: '/admin' } } } as unknown as Parameters<typeof AdminNavUser>[0]['payload']
    const out = html(h(AdminNavUser, { payload, user: { name: 'Sam Smith', role: 'editor', email: 'sam@example.test' } }))
    expect(out).toContain('Sam Smith')
    expect(out).toContain('Committee')
    expect(out).not.toContain('editor')
    expect(out).toContain('href="/admin/logout"')
    expect(out).toMatch(/Sign out/)
    expect(html(h(AdminNavUser, { payload, user: { role: 'admin', email: 'pat@example.test' } }))).toContain('pat')
    expect(html(h(AdminNavUser, { payload, user: { role: 'admin', email: 'pat@example.test' } }))).toContain('Site admin')
  })

  it('the calm notices use the kit buttons and keep their markers', () => {
    const none = html(h(NoAccessNotice, { signOutHref: '/admin/logout', selectorHref: null }))
    expect(none).toContain('data-admin-notice="no-access"')
    expect(none).toContain('ui-btn')
    expect(none).not.toContain('selector')
    expect(html(h(NoAccessNotice, { signOutHref: '/admin/logout', selectorHref: '/selectors' }))).toContain('Go to the selector area')
    const trouble = html(h(AuthTroubleNotice, { reloadHref: '/admin/social', signInHref: '/admin/login?redirect=%2Fadmin%2Fsocial' }))
    expect(trouble).toContain('role="alert"')
    expect(trouble).toContain('Reload')
  })
})
