import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { activeChip, chipHref, isWhereKey, type FilterChip } from '@/lib/admin/filter-chips'
import { adminMediaSrc, createBatchLoader, dateTile, fileTypeChip, newsStatus, onOff, playerStatus, saveStateLabel } from '@/lib/admin/list-status'
import { EventStatusCell, EventWhenCell, FileTypeCell, NewsStatusCell, OnOffCell, PlayerStatusCell, SponsorLevelCell } from '@/payload/components/ListCells'
import { Avatar } from '@/payload/components/ui/Avatar'
import { loadSanitizedConfig } from './helpers/sanitized-config'

const h = createElement as unknown as (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => ReactElement
const html = (node: ReactElement) => renderToStaticMarkup(node)
// The cells only read these props; the rest of Payload's cell props are not needed to draw a pill.
const cellProps = (rowData: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ rowData, cellData: undefined, collectionSlug: 'x', ...extra })

describe('list statuses', () => {
  it('a player is Hidden, Playing now or a Past player, with the committee override winning over the nightly value', () => {
    expect(playerStatus({ hidden: true, isActiveDerived: true }).label).toBe('Hidden')
    expect(playerStatus({ isActiveDerived: true }).label).toBe('Playing now')
    expect(playerStatus({ isActiveDerived: false }).label).toBe('Past player')
    expect(playerStatus({ activeOverride: 'past', isActiveDerived: true }).label).toBe('Past player')
    expect(playerStatus({ activeOverride: 'active', isActiveDerived: false }).label).toBe('Playing now')
  })

  it('a switch is shown in words and never as true or false', () => {
    expect(onOff(true, { on: 'Showing on the website', off: 'Hidden' }).label).toBe('Showing on the website')
    expect(onOff(false, { on: 'Showing on the website', off: 'Hidden' }).label).toBe('Hidden')
    for (const v of [true, false, null, undefined]) expect(onOff(v, { on: 'On', off: 'Off' }).label).not.toMatch(/true|false/i)
  })

  it('news is a draft, scheduled or showing', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    expect(newsStatus({ status: 'draft' }, now).label).toBe('Draft')
    expect(newsStatus({ status: 'published', publishedAt: '2026-11-01T00:00:00Z' }, now).label).toBe('Scheduled')
    expect(newsStatus({ status: 'published', publishedAt: '2026-10-01T00:00:00Z' }, now).label).toBe('Showing on the website')
    expect(newsStatus({ status: 'published' }, now).label).toBe('Showing on the website')
  })

  it('a date tile reads the stored day in UTC, and refuses nonsense', () => {
    expect(dateTile('2026-11-03T00:00:00.000Z')).toEqual({ day: '3', month: 'Nov', weekday: 'Tue' })
    expect(dateTile('nope')).toBeNull()
    expect(dateTile(null)).toBeNull()
  })

  it('file type chips', () => {
    expect(fileTypeChip('policy.final.pdf')).toBe('PDF')
    expect(fileTypeChip(null, 'application/pdf')).toBe('PDF')
    expect(fileTypeChip(null, null)).toBe('File')
  })
})

describe('save state wording', () => {
  const base = { processing: false, modified: false, lastSavedAt: null, now: 1_000_000, isNew: false }
  it('says Saving, Unsaved changes, Not saved yet, Saved just now', () => {
    expect(saveStateLabel({ ...base, processing: true, modified: true })).toBe('Saving...')
    expect(saveStateLabel({ ...base, modified: true })).toBe('Unsaved changes')
    expect(saveStateLabel({ ...base, isNew: true })).toBe('Not saved yet')
    expect(saveStateLabel({ ...base, lastSavedAt: 999_000 })).toBe('Saved just now')
    expect(saveStateLabel({ ...base, lastSavedAt: 1_000_000 - 5 * 60_000 })).toBe('Saved 5 min ago')
    expect(saveStateLabel({ ...base })).toBe('All changes saved')
    // A save that reloaded the page: the record's own updated time still says it was just saved; an old one does not.
    expect(saveStateLabel({ ...base, docUpdatedAt: 995_000 })).toBe('Saved just now')
    expect(saveStateLabel({ ...base, docUpdatedAt: 1_000_000 - 3 * 60_000 })).toBe('Last changed 3 min ago')
    expect(saveStateLabel({ ...base, docUpdatedAt: 1_000_000 - 2 * 86_400_000 })).toBe('All changes saved')
    expect(saveStateLabel({ ...base, lastSavedAt: 1_000_000 - 3 * 3600_000 })).toBe('All changes saved')
  })
})

describe('media addresses in the admin', () => {
  it('keeps the site\'s own files relative so they load on any host, and leaves other hosts alone', () => {
    expect(adminMediaSrc('http://localhost:3000/api/media/file/a.png', 'http://localhost:3000')).toBe('/api/media/file/a.png')
    expect(adminMediaSrc('https://x.public.blob.vercel-storage.com/a.png', 'http://localhost:3000')).toBe('https://x.public.blob.vercel-storage.com/a.png')
    expect(adminMediaSrc('http://localhost:30001/a.png', 'http://localhost:3000')).toBe('http://localhost:30001/a.png')
    expect(adminMediaSrc(null, 'http://localhost:3000')).toBeNull()
  })
})

describe('batch loader', () => {
  it('answers a whole page of rows with one lookup', async () => {
    const calls: number[][] = []
    const load = createBatchLoader<string>(async (ids) => {
      calls.push(ids)
      return new Map(ids.map((i) => [i, `v${i}`]))
    })
    const got = await Promise.all([load(1), load(2), load(3), load(2)])
    expect(got).toEqual(['v1', 'v2', 'v3', 'v2'])
    expect(calls).toEqual([[1, 2, 3]])
  })

  it('a failed lookup gives every row the plain fallback instead of throwing', async () => {
    const load = createBatchLoader<string>(async () => {
      throw new Error('db down')
    })
    expect(await Promise.all([load(1), load(2)])).toEqual([undefined, undefined])
  })
})

describe('filter chips', () => {
  const chips: FilterChip[] = [
    { key: 'hidden', label: 'Hidden', params: { 'where[hidden][equals]': 'true' } },
    { key: 'drafts', label: 'Drafts', params: { 'where[status][equals]': 'draft' } },
  ]
  it('a chip replaces the old filter and the page number, and keeps search and sort', () => {
    const cur = new URLSearchParams('search=ann&sort=displayName&page=3&where[status][equals]=draft&limit=25')
    const href = chipHref('/admin/collections/players', cur, chips[0])
    const out = new URLSearchParams(href.split('?')[1])
    expect(out.get('where[hidden][equals]')).toBe('true')
    expect(out.get('where[status][equals]')).toBeNull()
    expect(out.get('page')).toBeNull()
    expect(out.get('search')).toBe('ann')
    expect(out.get('sort')).toBe('displayName')
    expect(out.get('limit')).toBe('25')
  })
  it('"All" removes the filter', () => {
    expect(chipHref('/admin/collections/players', new URLSearchParams('where[hidden][equals]=true'), null)).toBe('/admin/collections/players')
  })
  it('the active chip is the one whose filter is in the address, a hand-built filter selects none', () => {
    expect(activeChip(new URLSearchParams(''), chips)).toEqual({ chip: null, custom: false })
    expect(activeChip(new URLSearchParams('where[hidden][equals]=true'), chips).chip?.key).toBe('hidden')
    expect(activeChip(new URLSearchParams('where%5Bhidden%5D%5Bequals%5D=true'), chips).chip?.key).toBe('hidden')
    expect(activeChip(new URLSearchParams('where[name][like]=x'), chips)).toEqual({ chip: null, custom: true })
    expect(isWhereKey('where[a][b]')).toBe(true)
    expect(isWhereKey('whereabouts')).toBe(false)
  })
})

describe('list cells draw words, never raw booleans', () => {
  it('player status, switch, news and file type cells', () => {
    expect(html(h(PlayerStatusCell, cellProps({ hidden: true })))).toContain('Hidden')
    expect(html(h(PlayerStatusCell, cellProps({ isActiveDerived: true })))).toContain('Playing now')
    const on = html(h(OnOffCell, { ...cellProps({}), cellData: true, on: 'Showing on the website', off: 'Hidden' }))
    const off = html(h(OnOffCell, { ...cellProps({}), cellData: false, on: 'Showing on the website', off: 'Hidden' }))
    expect(on).toContain('Showing on the website')
    expect(off).toContain('Hidden')
    for (const out of [on, off]) expect(out.replace(/<[^>]*>/g, '')).not.toMatch(/\b(true|false)\b/)
    expect(html(h(NewsStatusCell, cellProps({ status: 'draft' })))).toContain('Draft')
    expect(html(h(FileTypeCell, cellProps({ filename: 'a.pdf' })))).toContain('PDF')
    expect(html(h(SponsorLevelCell, { ...cellProps({}), cellData: 'Gold' }))).toContain('Gold')
  })

  it('events show a date tile or "Every <day>", and Coming up, Finished or Every week', () => {
    const tile = html(h(EventWhenCell, cellProps({ type: 'one_time', eventDate: '2026-11-03T00:00:00.000Z', title: 'BBQ' })))
    expect(tile).toContain('club-date-tile')
    expect(tile).toContain('Nov')
    expect(html(h(EventWhenCell, cellProps({ type: 'recurring', dayOfWeek: '2', title: 'Training' })))).toContain('Every Tuesday')
    expect(html(h(EventStatusCell, cellProps({ type: 'recurring' })))).toContain('Every week')
    expect(html(h(EventStatusCell, cellProps({ type: 'one_time', eventDate: '2000-01-01T00:00:00.000Z', eventTime: '10:00' })))).toContain('Finished')
    expect(html(h(EventStatusCell, cellProps({ type: 'one_time', eventDate: '2999-01-01T00:00:00.000Z' })))).toContain('Coming up')
  })

  it('an avatar shows the picture, or initials on a tint when there is none, and hides itself from screen readers', () => {
    const withPic = html(h(Avatar, { src: '/api/media/file/a.png', name: 'Sam Taylor' }))
    expect(withPic).toContain('<img')
    expect(withPic).toContain('aria-hidden="true"')
    expect(withPic).toContain('loading="lazy"')
    const none = html(h(Avatar, { name: 'Sam Taylor' }))
    expect(none).not.toContain('<img')
    expect(none).toContain('>ST<')
    expect(html(h(Avatar, { name: '' }))).toContain('>?<')
    expect(html(h(Avatar, { src: '/l.png', name: 'X', fit: 'contain' }))).toContain('ui-avatar--contain')
  })
})

// ---- the collection configs ----

type AnyField = Record<string, unknown>
const flat = (fields: unknown, acc: AnyField[] = []): AnyField[] => {
  if (!Array.isArray(fields)) return acc
  for (const f of fields as AnyField[]) {
    acc.push(f)
    flat(f.fields, acc)
    if (Array.isArray(f.tabs)) for (const t of f.tabs as AnyField[]) flat(t.fields, acc)
  }
  return acc
}
const COMMITTEE = ['players', 'sponsors', 'events', 'news', 'announcements', 'gallery-photos', 'people', 'documents', 'player-sponsors']

describe('committee list and form configuration', () => {
  it('every committee collection with a redesigned list is tagged committee-facing', async () => {
    const cfg = await loadSanitizedConfig()
    for (const slug of COMMITTEE) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      expect((c.admin.custom as { committeeFacing?: boolean } | undefined)?.committeeFacing, slug).toBe(true)
    }
  }, 30_000)

  it('no default column is a raw checkbox: a checkbox column always has a words cell', async () => {
    const cfg = await loadSanitizedConfig()
    const bad: string[] = []
    for (const slug of COMMITTEE) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      const fields = flat(c.fields)
      for (const col of c.admin.defaultColumns ?? []) {
        const f = fields.find((x) => x.name === col)
        if (f?.type === 'checkbox' && !(f.admin as { components?: { Cell?: unknown } } | undefined)?.components?.Cell) bad.push(`${slug}.${col}`)
      }
    }
    expect(bad).toEqual([])
  }, 30_000)

  it('the search box says "Search by" plain field names: no slug, no "(optional)", no camel case', async () => {
    const cfg = await loadSanitizedConfig()
    const bad: string[] = []
    for (const slug of COMMITTEE) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      const fields = flat(c.fields)
      for (const name of c.admin.listSearchableFields ?? []) {
        const f = fields.find((x) => x.name === name)
        const label = typeof f?.label === 'string' ? f.label : String(name)
        if (/slug|optional|[a-z][A-Z]/.test(`${name === 'slug' ? 'slug' : ''}${label}`)) bad.push(`${slug}.${name}: "${label}"`)
        if (name === 'slug') bad.push(`${slug} searches the web address`)
      }
    }
    expect(bad).toEqual([])
  }, 30_000)

  it('field help on every committee collection is one short sentence (110 characters or fewer)', async () => {
    const cfg = await loadSanitizedConfig()
    const long: string[] = []
    for (const slug of [...COMMITTEE, 'pages', 'stories', 'yearbooks']) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      for (const f of flat(c.fields)) {
        const d = (f.admin as { description?: unknown } | undefined)?.description
        if (typeof d === 'string' && d.length > 110) long.push(`${slug}.${String(f.name ?? f.label)}: ${d.length}`)
      }
      const cd = (c.admin as { description?: unknown }).description
      if (typeof cd === 'string' && cd.length > 110) long.push(`${slug} (page lead): ${cd.length}`)
    }
    expect(long).toEqual([])
  }, 30_000)

  it('internal fields sit in a closed Details area that ends the form (web address, source, nightly flags)', async () => {
    const cfg = await loadSanitizedConfig()
    const players = cfg.collections.find((x) => x.slug === 'players')!
    const details = (players.fields as AnyField[]).find((f) => f.type === 'collapsible' && f.label === 'Details')
    expect(details).toBeTruthy()
    expect((details!.admin as { initCollapsed?: boolean }).initCollapsed).toBe(true)
    const inside = flat(details!.fields).map((f) => f.name)
    expect(inside).toEqual(expect.arrayContaining(['slug', 'source', 'isActiveDerived', 'docMeta']))
    // Nothing the committee edits day to day is hidden away in there.
    expect(inside).not.toContain('hidden')
    expect(inside).not.toContain('photo')
    const news = cfg.collections.find((x) => x.slug === 'news')!
    expect(flat((news.fields as AnyField[]).find((f) => f.label === 'Details')!.fields).map((f) => f.name)).toContain('slug')
    // No sidebar column on the redesigned forms: it folds into the form on a phone, and Details stays last.
    for (const slug of ['players', 'news', 'people', 'player-sponsors']) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      expect(flat(c.fields).filter((f) => (f.admin as { position?: string } | undefined)?.position === 'sidebar').map((f) => f.name), slug).toEqual([])
    }
    const order = players.fields as AnyField[]
    const at = order.findIndex((f) => String((f.admin as { className?: string } | undefined)?.className).includes('club-details'))
    expect(at).toBeGreaterThan(0)
    expect(order.slice(at + 1).map((f) => f.name)).toEqual(order.slice(at + 1).filter((f) => f.name === 'createdAt' || f.name === 'updatedAt').map((f) => f.name))
  }, 30_000)

  it('picture fields carry a preview and the type hint; the save bar slot is set on every committee collection', async () => {
    const cfg = await loadSanitizedConfig()
    const pics: Array<[string, string]> = [['players', 'photo'], ['people', 'photo'], ['sponsors', 'logo'], ['news', 'cover'], ['events', 'cover']]
    for (const [slug, name] of pics) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      const f = flat(c.fields).find((x) => x.name === name)!
      const comps = (f.admin as { components?: { afterInput?: unknown[] } }).components
      expect(JSON.stringify(comps?.afterInput), `${slug}.${name}`).toContain('UploadPreview')
      expect(String((f.admin as { description?: string }).description), `${slug}.${name}`).toMatch(/JPG, PNG or WebP/)
    }
    for (const slug of COMMITTEE) {
      const c = cfg.collections.find((x) => x.slug === slug)!
      expect(JSON.stringify((c.admin.components as { edit?: unknown }).edit), slug).toContain('SaveState')
    }
  }, 30_000)

  it('"Show as" has a plain default instead of "Select a value"', async () => {
    const cfg = await loadSanitizedConfig()
    const f = flat(cfg.collections.find((x) => x.slug === 'players')!.fields).find((x) => x.name === 'activeOverride')!
    expect((f.admin as { placeholder?: string }).placeholder).toBe('Let the site decide')
  }, 30_000)
})
