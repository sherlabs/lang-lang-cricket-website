import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import { officeCollections } from '../payload/admin/navigation'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/**
 * Field-level audit for personal and financial office data (wave D spec 3.4): every field of every office collection declares
 * explicit read, create and update access that an editor, a selector and an anonymous caller all fail, and sensitive field names
 * appear on no other collection beyond a frozen list of the ones that already existed when the wave began.
 */
const admin = { id: 1, role: 'admin' }
const others = [{ id: 2, role: 'editor' }, { id: 3, role: 'selector' }, undefined, { id: 4, role: 'admin', disabled: true }]
const AUTO = new Set(['id', 'createdAt', 'updatedAt'])

type AccessFn = (a: { req: { user: unknown } }) => unknown
type Leaf = { path: string; field: Field & { access?: Record<string, AccessFn> } }

function leaves(fields: readonly Field[], prefix = ''): Leaf[] {
  const out: Leaf[] = []
  for (const f of fields) {
    const name = 'name' in f && typeof f.name === 'string' ? f.name : null
    const path = name ? `${prefix}${name}` : prefix
    if (name) out.push({ path, field: f as Leaf['field'] })
    if ('fields' in f && Array.isArray(f.fields)) out.push(...leaves(f.fields, name ? `${path}.` : prefix))
    if (f.type === 'tabs') for (const t of f.tabs) out.push(...leaves(t.fields, 'name' in t && t.name ? `${prefix}${t.name}.` : prefix))
  }
  return out
}

describe('office collections: every field declares its access', () => {
  it('has at least the members collection', () => {
    expect(officeCollections.map((c) => c.slug)).toContain('members')
  })

  it('every field has read, create and update functions that only an active admin passes', async () => {
    const config = await loadSanitizedConfig()
    const problems: string[] = []
    for (const slug of officeCollections.filter((c) => c.role === 'admin').map((c) => c.slug)) {
      const col = config.collections.find((c) => c.slug === slug)
      expect(col, slug).toBeTruthy()
      for (const { path, field } of leaves(col!.fields)) {
        if (AUTO.has(path)) continue
        for (const op of ['read', 'create', 'update'] as const) {
          const fn = (field.access as Record<string, AccessFn> | undefined)?.[op]
          if (typeof fn !== 'function') {
            problems.push(`${slug}.${path} has no ${op} access`)
            continue
          }
          for (const user of others) if (fn({ req: { user } })) problems.push(`${slug}.${path} ${op} allowed for ${JSON.stringify(user)}`)
        }
        const read = (field.access as Record<string, AccessFn> | undefined)?.read
        if (typeof read === 'function' && !read({ req: { user: admin } })) problems.push(`${slug}.${path} cannot be read by an admin`)
      }
    }
    expect(problems).toEqual([])
  })

  it('every admin office collection denies every operation to non-admins at collection level', async () => {
    const config = await loadSanitizedConfig()
    for (const slug of officeCollections.filter((c) => c.role === 'admin').map((c) => c.slug)) {
      const access = config.collections.find((c) => c.slug === slug)!.access as unknown as Record<string, AccessFn>
      for (const op of ['read', 'create', 'update', 'delete']) {
        for (const user of others) expect(access[op]({ req: { user } }), `${slug} ${op} ${JSON.stringify(user)}`).toBe(false)
      }
    }
  })
})

/** Field names that hold personal contact data. Matched on the last path segment, case-insensitively. */
const SENSITIVE = /^(email|phone|address.*|locality|region|postalcode|dateofbirth|emergency.*|notes)$/i
/**
 * Fields that carried one of those names before the wave began. Frozen: a new occurrence outside the office collections fails here,
 * so private data cannot drift onto a public collection by accident.
 */
const EXISTING = new Set([
  'users.email',
  'people.phone',
  'people.email',
  'event-rsvps.email',
  'player-selection-profiles.phone',
  'player-selection-profiles.notes',
  'club.email',
  'club.address',
  'club.address.locality',
  'club.address.region',
  'team-sheets.notes',
  'net-sessions.notes',
])

describe('sensitive field names stay inside the office set', () => {
  it('no new collection or global outside the office set gains one', async () => {
    const config = await loadSanitizedConfig()
    const office = new Set(officeCollections.map((c) => c.slug).concat('office-settings'))
    const found: string[] = []
    for (const c of [...config.collections, ...config.globals]) {
      if (office.has(c.slug) || c.slug.startsWith('payload-')) continue
      for (const { path } of leaves(c.fields)) if (SENSITIVE.test(path.split('.').pop()!)) found.push(`${c.slug}.${path}`)
    }
    const fresh = found.filter((f) => !EXISTING.has(f))
    expect(fresh, 'private data must live in an office collection; extend the frozen list only for a deliberate, public-safe field').toEqual([])
  })
})
