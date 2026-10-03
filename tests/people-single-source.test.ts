/**
 * Grep-style guard for "one source of truth for individuals" (design note
 * 2026-10-04-people-sponsors-apparel-design.md, "Call sites migrated"). Fails when someone adds a
 * second way to read or draw a person.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(root, f)
const read = (f: string) => readFileSync(f, 'utf8')
const frontend = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(root, d)))

describe('individuals come from one place', () => {
  it('only lib/people-queries.ts reads the people collection', () => {
    const offenders = frontend.filter((f) => /collection:\s*'people'/.test(read(f))).map(rel)
    expect(offenders).toEqual(['lib/people-queries.ts'])
  })

  it('pages use listPeople from lib/people-queries and PeopleGrid, for every page that shows people', () => {
    for (const page of ['app/(frontend)/page.tsx', 'app/(frontend)/contact/page.tsx', 'app/(frontend)/people/page.tsx']) {
      const src = read(path.join(root, page))
      expect(src, page).toContain("from '@/lib/people-queries'")
      expect(src, page).toContain('PeopleGrid')
    }
    expect(read(path.join(root, 'lib/content-queries.ts'))).not.toMatch(/listPeople|toPerson/)
  })

  it('toPerson is only used by the people query layer', () => {
    const offenders = frontend.filter((f) => /\btoPerson\b/.test(read(f))).map(rel).sort()
    expect(offenders).toEqual(['lib/payload/mappers.ts', 'lib/people-queries.ts'])
  })

  it('no second initials helper or raw person photo markup outside the shared Avatar', () => {
    const initialsDefs = frontend.filter((f) => /(function|const)\s+initials\b/.test(read(f))).map(rel)
    expect(initialsDefs).toEqual(['lib/identity.ts'])
    // Raw <img> of a person/player photo (photoUrl) bypasses the one fallback rule.
    const rawPhoto = frontend.filter((f) => /<img[^>]*src=\{[^}]*photoUrl/.test(read(f))).map(rel)
    expect(rawPhoto).toEqual(['components/avatar.tsx'])
  })

  it('player photos are resolved in the player query layer (identity rule), not per page', () => {
    const q = read(path.join(root, 'lib/players/queries.ts'))
    expect(q).toContain('getLinkedPeople')
    expect(q).toContain('resolvePlayerIdentity')
  })

  it('no person is stored as free text in the club global or its defaults', () => {
    const globalSrc = read(path.join(root, 'payload/globals/Club.ts'))
    expect(globalSrc).not.toMatch(/president|secretary|treasurer|contactPerson|contactName|contactPhone/i)
    const defaults = read(path.join(root, 'payload/seed/club-defaults.ts'))
    expect(defaults).not.toMatch(/Savige|president:|secretary:|treasurer:/i)
  })
})
