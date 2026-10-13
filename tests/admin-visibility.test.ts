import { describe, expect, it } from 'vitest'
import { advancedNav, everydayNav, internalCollections, isNavActive, jobTiles, navFor, officeCollections, selectionCollections, socialCollections } from '../payload/admin/navigation'
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
  it('editors get the short plain list and the Selectors, Social posts, stories and yearbooks entries of Advanced', () => {
    const nav = navFor('editor')
    // Selectors is an occasional task, so it is an Advanced entry (not a 17th everyday one) that editors can reach; also a Home tile.
    // Social posts (wave C) is the same kind of entry: an occasional task with a Home tile. The styling settings stay admin only.
    expect(nav.advanced.map((e) => e.key)).toEqual(['selectors', 'social', 'stories', 'yearbooks'])
    expect(navFor('admin').advanced.map((e) => e.key)).toContain('social-settings')
    expect(nav.advanced.map((e) => e.key)).not.toContain('social-settings')
    expect(navFor(null).advanced.map((e) => e.key)).not.toContain('social')
    expect(navFor('selector').advanced).toEqual([])
    // 12 -> 14: Player sponsors and Club apparel link each need an everyday entry (editors must reach them).
    // 14 -> 16: Pages and News are committee-run content (WP-P); hiding them under Advanced was rejected.
    // 16 -> 17: Club office (wave D). One entry replaces the seven it would otherwise take (members, fees, volunteers, meetings,
    // diary, email, stock); every module is a tile on its page. It is the only new everyday entry of the wave.
    // 17 -> 15: Club history stories and Season yearbooks are occasional, so they moved under Advanced (still open to editors).
    expect(nav.everyday.length).toBeLessThanOrEqual(16)
    expect(nav.everyday.map((e) => e.key)).toContain('office')
    expect(navFor(null).everyday.map((e) => e.key)).toContain('office') // the sidebar only renders for a signed-in user; the view itself refuses non-staff
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
    // 12 -> 13: Add a selector (announce teams); creating logins is occasional, so it is a tile and an Advanced entry, not an everyday menu item.
    // 13 -> 14: Make a social post. Posting a result is a weekly job for editors and deserves a Home shortcut; the cap keeps Home
    // scannable and one more tile does not change that (the apparel tile stays).
    expect(jobTiles.length).toBeLessThanOrEqual(14)
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
      if (internalCollections.includes(e.slug) || socialCollections.includes(e.slug)) {
        // Written only by code: hidden from every role, absent from both menus, never writable via REST/admin.
        expect(navSlugs.has(e.slug), `${e.slug} is internal and must not be in a nav list`).toBe(false)
        expect(e.admin.hidden, `${e.slug} must be admin.hidden === true`).toBe(true)
        const access = (e as { access?: Record<string, (a: { req: { user: unknown } }) => unknown> }).access!
        for (const op of ['create', 'update', 'delete']) {
          expect(access[op]({ req: { user: admin } }), `${e.slug} ${op} must be denied even to admins`).toBe(false)
        }
        // The merge log holds whole player snapshots and the throttle and sign-in replay tables hold hashed keys and token ids, so they are admin-only; the other internal collections are readable by staff.
        expect(access.read({ req: { user: editor } }), `${e.slug} read by an editor`).toBe(e.slug !== 'merge-log' && e.slug !== 'throttle-hits' && e.slug !== 'auth-broker-jtis')
        expect(access.read({ req: { user: admin } }), `${e.slug} read by an admin`).toBe(true)
        expect(access.read({ req: { user: undefined } }), `${e.slug} read is staff only`).toBe(false)
      } else if (officeCollections.some((c) => c.slug === e.slug)) {
        // Club office data (wave D): never in a menu, reached through the Club office pages. Admin collections are hidden from editors
        // (which also blocks the native routes) and denied to them over REST; staff collections stay visible by route but off the menus.
        const entry = officeCollections.find((c) => c.slug === e.slug)!
        expect(navSlugs.has(e.slug), `${e.slug} is an office collection and must not be in a nav list`).toBe(false)
        const access = (e as { access?: Record<string, (a: { req: { user: unknown } }) => unknown> }).access!
        if (entry.role === 'admin') {
          expect(typeof e.admin.hidden, `${e.slug} should use hiddenFromEditors`).toBe('function')
          expect((e.admin.hidden as (a: { user: unknown }) => boolean)({ user: editor })).toBe(true)
          expect((e.admin.hidden as (a: { user: unknown }) => boolean)({ user: admin })).toBe(false)
          for (const op of ['read', 'create', 'update', 'delete']) {
            expect(access[op]({ req: { user: editor } }), `${e.slug} ${op} by an editor`).toBe(false)
            expect(access[op]({ req: { user: { id: 3, role: 'selector' } } }), `${e.slug} ${op} by a selector`).toBe(false)
            expect(access[op]({ req: { user: undefined } }), `${e.slug} ${op} anonymous`).toBe(false)
          }
          expect(access.read({ req: { user: admin } }), `${e.slug} read by an admin`).toBe(true)
        } else {
          expect(e.admin.hidden, `${e.slug} is a staff office collection and stays reachable`).toBeFalsy()
        }
      } else if (selectionCollections.includes(e.slug)) {
        // Selection data: hidden for every role, in no menu, managed in the selector area. Over REST only admin and editor may read or
        // write (never a selector or an anonymous visitor); `selection-fixtures` is written by code only.
        expect(navSlugs.has(e.slug), `${e.slug} is a selection collection and must not be in a nav list`).toBe(false)
        expect(e.admin.hidden, `${e.slug} must be admin.hidden === true`).toBe(true)
        const access = (e as { access?: Record<string, (a: { req: { user: unknown } }) => unknown> }).access!
        const codeOnly = e.slug === 'selection-fixtures'
        // Ballots are private: not even an admin can read or write one over REST or in the admin (wave B spec 3.3).
        const sealed = e.slug === 'best-player-ballots'
        for (const op of ['read', 'create', 'update', 'delete']) {
          const writes = op !== 'read'
          expect(access[op]({ req: { user: admin } }), `${e.slug} ${op} by an admin`).toBe(sealed ? false : !(writes && codeOnly))
          expect(access[op]({ req: { user: editor } }), `${e.slug} ${op} by an editor`).toBe(sealed ? false : !(writes && codeOnly))
          expect(access[op]({ req: { user: { id: 3, role: 'selector' } } }), `${e.slug} ${op} by a selector`).toBe(false)
          expect(access[op]({ req: { user: { id: 2, role: 'editor', disabled: true } } }), `${e.slug} ${op} by a disabled editor`).toBe(false)
          expect(access[op]({ req: { user: undefined } }), `${e.slug} ${op} anonymous`).toBe(false)
        }
      } else {
        expect(navSlugs.has(e.slug), `${e.slug} is missing from payload/admin/navigation.ts`).toBe(true)
      }
    }
    for (const slug of selectionCollections) expect(entities.some((x) => x.slug === slug), `${slug} is listed as a selection collection but is not a collection`).toBe(true)
    for (const { slug } of officeCollections) expect(entities.some((x) => x.slug === slug), `${slug} is listed as an office collection but is not a collection`).toBe(true)
    for (const slug of socialCollections) expect(entities.some((x) => x.slug === slug), `${slug} is listed as a social collection but is not a collection`).toBe(true)
    for (const slug of internalCollections) expect(entities.some((x) => x.slug === slug), `${slug} is listed as internal but is not a collection`).toBe(true)
    // Entities listed under Advanced must be hidden from editors unless they are a deliberate upload target.
    const uploadTargets = new Set(['media', 'event-photos', ...advancedNav.filter((e) => e.forEditors).map((e) => e.path.split('/').pop()!)])
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
  }, 90_000)
})
