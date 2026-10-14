import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { notificationCopy, officeCopy } from '../payload/admin/copy'
import { helpContacts, helpIntro, helpSections } from '../payload/admin/helpContent'
import { advancedNav, everydayNav, jobTiles, navGroups, navSubgroups } from '../payload/admin/navigation'
import { DOCUMENT_WORD_OK, MICROCOPY_ALLOW } from './admin-microcopy.allow'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/**
 * Committee-facing text avoids developer words. Scoped on purpose (wave G spec 1.3): it reads declared user-visible properties of
 * the collections and globals the committee can reach, the menu, the Home tiles, the wording modules and the files tagged
 * `// @committee-facing`, never arbitrary string literals (class names, keys, imports, aria hooks).
 */
const BANNED = /\b(collections?|globals?|slugs?|relationships?|derived|sync runs?|fields?|docs?|populate[sd]?|documents?)\b/i
const DOCUMENT = /\bdocuments?\b/i

const root = path.resolve(__dirname, '..')

function violations(where: string, text: string, opts: { documentOk?: boolean } = {}): string[] {
  const out: string[] = []
  for (const m of text.matchAll(new RegExp(BANNED.source, 'gi'))) {
    const word = m[0]
    if (opts.documentOk && DOCUMENT.test(word)) continue
    if (MICROCOPY_ALLOW.some((a) => a.where === where && a.text === text)) continue
    out.push(`${where}: "${word}" in "${text}"`)
  }
  return out
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** The visible strings of one field (label, help, placeholder, option labels), recursing into groups, rows, tabs and blocks. */
function fieldStrings(fields: unknown, where: string, acc: Array<{ where: string; text: string }> = []): Array<{ where: string; text: string }> {
  if (!Array.isArray(fields)) return acc
  for (const f of fields as Array<Record<string, unknown>>) {
    const name = str(f.name) ?? str(f.label) ?? str(f.type) ?? '?'
    const here = `${where}.${name}`
    const admin = (f.admin ?? {}) as Record<string, unknown>
    for (const [k, v] of [['label', f.label], ['description', admin.description], ['placeholder', admin.placeholder]] as const) {
      const s = str(v)
      if (s) acc.push({ where: `${here}.${k}`, text: s })
    }
    if (Array.isArray(f.options)) for (const o of f.options as Array<unknown>) {
      const s = typeof o === 'string' ? null : str((o as { label?: unknown }).label)
      if (s) acc.push({ where: `${here}.option`, text: s })
    }
    fieldStrings(f.fields, here, acc)
    if (Array.isArray(f.tabs)) for (const t of f.tabs as Array<Record<string, unknown>>) {
      const s = str(t.label)
      if (s) acc.push({ where: `${here}.tab`, text: s })
      fieldStrings(t.fields, `${here}.${str(t.label) ?? 'tab'}`, acc)
    }
    if (Array.isArray(f.blocks)) for (const b of f.blocks as Array<Record<string, unknown>>) fieldStrings(b.fields, `${here}.${str(b.slug) ?? 'block'}`, acc)
  }
  return acc
}

/** The WP-5 committee views (Club office and its modules, Selectors, Fantasy) are tagged too. */
const wp5Tagged = [...readdirSync(path.join(root, 'payload/components')).filter((f) => /^Office.*(View|Bits)\.tsx$/.test(f)), 'SelectorsView.tsx', 'SelectorsPanel.tsx', 'FantasyView.tsx', 'FantasyPanel.tsx'].map((f) => `payload/components/${f}`)

describe('committee microcopy', () => {
  it('the menu, group headings and Home tiles use plain words', () => {
    const bad: string[] = []
    const committeeNav = [...everydayNav, ...advancedNav.filter((e) => e.forEditors)]
    for (const e of committeeNav) bad.push(...violations(`nav.${e.key}`, e.label, { documentOk: DOCUMENT_WORD_OK.navKeys.includes(e.key) }))
    for (const [k, g] of [...Object.entries(navGroups), ...Object.entries(navSubgroups)]) bad.push(...violations(`navGroup.${k}`, g.label))
    for (const t of jobTiles) {
      const ok = DOCUMENT_WORD_OK.tileKeys.includes(t.key)
      bad.push(...violations(`tile.${t.key}.title`, t.title, { documentOk: ok }), ...violations(`tile.${t.key}.hint`, t.hint, { documentOk: ok }))
    }
    expect(bad).toEqual([])
  })

  it('the Home wording module and the Help page use plain words', () => {
    const bad: string[] = []
    const c = notificationCopy.committee
    for (const [k, v] of Object.entries(c)) bad.push(...violations(`notificationCopy.committee.${k}`, typeof v === 'function' ? (v as (...a: unknown[]) => string)(2, 'Tue 1 Jan') : v))
    bad.push(...violations('help.intro', helpIntro))
    for (const s of helpSections) {
      bad.push(...violations(`help.${s.id}.title`, s.title, { documentOk: true }))
      for (const step of s.steps) bad.push(...violations(`help.${s.id}.step`, step, { documentOk: true }))
    }
    for (const x of helpContacts) bad.push(...violations(`help.contact.${x.who}`, `${x.who} ${x.how}`))
    expect(bad).toEqual([])
  })

  it('the collections and globals the committee can open have plain labels, help and options', async () => {
    const config = await loadSanitizedConfig()
    const slugs = new Set([...everydayNav, ...advancedNav.filter((e) => e.forEditors)].map((e) => e.path.split('/').pop()!).filter((s) => s))
    const bad: string[] = []
    const check = (slug: string, strings: Array<{ where: string; text: string }>) => {
      for (const s of strings) bad.push(...violations(s.where, s.text, { documentOk: DOCUMENT_WORD_OK.collections.includes(slug) }))
    }
    let seen = 0
    for (const c of config.collections.filter((x) => slugs.has(x.slug))) {
      seen++
      const labels = (c.labels ?? {}) as { singular?: unknown; plural?: unknown }
      const own = [
        { where: `${c.slug}.singular`, text: str(labels.singular) ?? '' },
        { where: `${c.slug}.plural`, text: str(labels.plural) ?? '' },
        { where: `${c.slug}.description`, text: str((c.admin as { description?: unknown }).description) ?? '' },
      ].filter((x) => x.text)
      check(c.slug, [...own, ...fieldStrings(c.fields, c.slug)])
    }
    for (const g of config.globals.filter((x) => slugs.has(x.slug))) {
      seen++
      const own = [{ where: `${g.slug}.label`, text: str(g.label) ?? '' }, { where: `${g.slug}.description`, text: str((g.admin as { description?: unknown }).description) ?? '' }].filter((x) => x.text)
      check(g.slug, [...own, ...fieldStrings(g.fields, g.slug)])
    }
    expect(seen).toBeGreaterThan(8)
    expect(bad).toEqual([])
  }, 90_000)

  it('files tagged // @committee-facing use plain words in their visible text and headings', () => {
    const tagged = ['payload/components/AdminNotices.tsx', 'payload/components/LoginIntro.tsx', 'payload/components/AdminNavUser.tsx', 'payload/components/ApprovalsView.tsx', 'payload/components/HelpView.tsx', 'payload/components/Dashboard.tsx', 'payload/components/AttentionPanel.tsx', 'payload/components/SeasonGlanceCard.tsx', 'payload/components/MilestonesWidget.tsx', 'payload/components/ListCells.tsx', 'payload/components/SaveState.tsx', 'payload/components/DocMeta.tsx', 'payload/components/UploadPreview.tsx', 'payload/components/ListFilterChips.tsx', ...wp5Tagged]
    const bad: string[] = []
    for (const f of tagged) {
      const src = readFileSync(path.join(root, f), 'utf8')
      expect(src.split('\n')[0], `${f} must start with the committee-facing marker`).toBe('// @committee-facing')
      const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const texts = [...body.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean)
      const props = [...body.matchAll(/\b(?:title|lead|summary|label)="([^"]+)"/g)].map((m) => m[1])
      const quoted = [...body.matchAll(/(?:title|lead|summary|label)=\{`([^`]+)`\}/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, 'N'))
      for (const t of [...texts, ...props, ...quoted]) bad.push(...violations(f, t, { documentOk: DOCUMENT_WORD_OK.files.includes(path.basename(f)) }))
    }
    expect(bad).toEqual([])
  })

  it('the Club office wording module uses plain words', () => {
    const bad: string[] = []
    const walk = (where: string, v: unknown) => {
      if (typeof v === 'string') bad.push(...violations(where, v, { documentOk: /documents?/i.test(where) }))
      else if (typeof v === 'function') {
        try {
          const out = (v as (...a: unknown[]) => unknown)(2, 3, 'a', 'b')
          if (typeof out === 'string') bad.push(...violations(where, out))
        } catch {
          // a wording function that needs real data is checked where it is used
        }
      } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${where}.${k}`, x)
    }
    walk('officeCopy', officeCopy)
    expect(bad).toEqual([])
  })

  it('the checker itself catches developer words and honours the Documents exception', () => {
    expect(violations('x', 'Edit the slug field of this collection')).toHaveLength(3)
    expect(violations('x', 'Upload a document', { documentOk: true })).toEqual([])
    expect(violations('x', 'This document will be saved')).toHaveLength(1)
  })
})
