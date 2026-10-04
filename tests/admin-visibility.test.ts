import { describe, expect, it } from 'vitest'
import { advancedNav, everydayNav, internalCollections, isNavActive, jobTiles, navFor } from '../payload/admin/navigation'
import { adminOnlyCondition, hiddenFromEditors, isAdminUser } from '../payload/admin/visibility'
import { helpSections } from '../payload/admin/helpContent'
import { loadSanitizedConfig } from './helpers/sanitized-config'

const admin = { id: 1, role: 'admin' }
const editor = { id: 2, role: 'editor' }

describe('role visibility helpers', () => {
  it('only admins are admins', () => {
    expect(isAdminUser(admin)).toBe(true)
    expect(isAdminUser(editor)).toBe(false)
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
    expect(isAdminUser({})).toBe(false)
  })

  it('hiddenFromEditors hides from editors and anonymous, never from admins', () => {
    expect(hiddenFromEditors({ user: admin })).toBe(false)
    expect(hiddenFromEditors({ user: editor })).toBe(true)
    expect(hiddenFromEditors({ user: undefined })).toBe(true)
  })

  it('adminOnlyCondition shows a field to admins only, and honours an extra rule', () => {
    const cond = adminOnlyCondition()
    expect(cond({}, {}, { user: admin })).toBe(true)
    expect(cond({}, {}, { user: editor })).toBe(false)
    expect(cond({}, {})).toBe(false)
    const withRule = adminOnlyCondition((data) => data.x === 1)
    expect(withRule({ x: 1 }, {}, { user: admin })).toBe(true)
    expect(withRule({ x: 2 }, {}, { user: admin })).toBe(false)
    expect(withRule({ x: 1 }, {}, { user: editor })).toBe(false)
  })
})

describe('navigation', () => {
  it('editors get the short plain list and never the Advanced section', () => {
    const nav = navFor('editor')
    expect(nav.advanced).toEqual([])
    // 12 -> 14: Player sponsors and Club apparel link each need an everyday entry (editors must reach them).
    // 14 -> 16: Pages and News are committee-run content (WP-P); hiding them under Advanced was rejected.
    expect(nav.everyday.length).toBeLessThanOrEqual(16)
    expect(nav.everyday.map((e) => e.path)).not.toContain('/collections/users')
  })

  it('admins get everything under Advanced', () => {
    expect(navFor('admin').advanced).toEqual(advancedNav)
    expect(navFor(null).advanced).toEqual([])
  })

  it('keys and paths are unique', () => {
    const all = [...everydayNav, ...advancedNav]
    expect(new Set(all.map((e) => e.key)).size).toBe(all.length)
    expect(new Set(all.map((e) => e.path)).size).toBe(all.length)
  })

  it('marks the right entry active', () => {
    const events = everydayNav.find((e) => e.key === 'events')!
    const home = everydayNav.find((e) => e.key === 'home')!
    expect(isNavActive(events, '/admin/collections/events', '/admin')).toBe(true)
    expect(isNavActive(events, '/admin/collections/events/create', '/admin')).toBe(true)
    expect(isNavActive(events, '/admin/collections/event-photos', '/admin')).toBe(false)
    expect(isNavActive(home, '/admin', '/admin')).toBe(true)
    expect(isNavActive(home, '/admin/collections/events', '/admin')).toBe(false)
  })

  it('every job tile links under the admin', () => {
    for (const t of jobTiles) expect(t.path.startsWith('/')).toBe(true)
    // 8 -> 10: Add a player sponsor and Change the apparel link.
    // 10 -> 12: Add a page and Post news (WP-P).
    expect(jobTiles.length).toBeLessThanOrEqual(12)
  })

  it('help content has steps in every section', () => {
    for (const s of helpSections) expect(s.steps.length).toBeGreaterThan(0)
  })
})

describe('every collection and global is classified (new ones fail here until they are)', () => {
  it('uses the custom sidebar, plain labels, and appears in exactly one nav list', async () => {
    const config = await loadSanitizedConfig()
    const navSlugs = new Set([...everydayNav, ...advancedNav].map((e) => e.path.split('/').pop()))
    const entities = [
      ...config.collections.map((c) => ({ kind: 'collection', slug: c.slug, admin: c.admin, labels: c.labels, access: c.access })),
      ...config.globals.map((g) => ({ kind: 'global', slug: g.slug, admin: g.admin, labels: undefined })),
    ]
    for (const e of entities.filter((x) => !x.slug.startsWith('payload-'))) {
      // Payload's grouped nav is replaced by AdminNav: a stray group would add a second menu.
      expect(e.admin.group, `${e.slug} admin.group`).toBe(false)
      if (internalCollections.includes(e.slug)) {
        // Written only by code: hidden from every role, absent from both menus, never writable via REST/admin.
        expect(navSlugs.has(e.slug), `${e.slug} is internal and must not be in a nav list`).toBe(false)
        expect(e.admin.hidden, `${e.slug} must be admin.hidden === true`).toBe(true)
        const access = (e as { access?: Record<string, (a: { req: { user: unknown } }) => unknown> }).access!
        for (const op of ['create', 'update', 'delete']) {
          expect(access[op]({ req: { user: admin } }), `${e.slug} ${op} must be denied even to admins`).toBe(false)
        }
        // The merge log holds whole player snapshots, so it is admin-only; the other internal collections are readable by staff.
        expect(access.read({ req: { user: editor } }), `${e.slug} read by an editor`).toBe(e.slug !== 'merge-log')
        expect(access.read({ req: { user: admin } }), `${e.slug} read by an admin`).toBe(true)
        expect(access.read({ req: { user: undefined } }), `${e.slug} read is staff only`).toBe(false)
      } else {
        expect(navSlugs.has(e.slug), `${e.slug} is missing from payload/admin/navigation.ts`).toBe(true)
      }
    }
    for (const slug of internalCollections) expect(entities.some((x) => x.slug === slug), `${slug} is listed as internal but is not a collection`).toBe(true)
    // Entities listed under Advanced must be hidden from editors unless they are a deliberate upload target.
    const uploadTargets = new Set(['media', 'event-photos'])
    for (const entry of advancedNav) {
      const slug = entry.path.split('/').pop()!
      const e = entities.find((x) => x.slug === slug)
      if (!e) {
        // A custom admin view (not a collection or global): it refuses non-admins itself (checked in the int tests) and sits in Advanced only.
        expect(/^\/(collections|globals)\//.test(entry.path), `${entry.key} points at a collection or global that does not exist`).toBe(false)
        continue
      }
      if (uploadTargets.has(slug)) continue
      expect(typeof e.admin.hidden, `${slug} should use hiddenFromEditors`).toBe('function')
      expect((e.admin.hidden as (a: { user: unknown }) => boolean)({ user: editor })).toBe(true)
      expect((e.admin.hidden as (a: { user: unknown }) => boolean)({ user: admin })).toBe(false)
    }
    // Everyday entities are never hidden from editors.
    for (const entry of everydayNav) {
      const slug = entry.path.split('/').pop()!
      const e = entities.find((x) => x.slug === slug)
      if (e) expect(e.admin.hidden, `${slug} must stay visible`).toBeFalsy()
    }
  }, 30_000)
})
