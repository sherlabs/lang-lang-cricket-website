import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')
const walk = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(path.join(root, dir))) return out
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}

/** Pure modules: no Next, no Payload, no database. */
const PURE = ['rules', 'score', 'eligibility', 'pricing', 'squad', 'rounds', 'leaderboard', 'names', 'link', 'throttle', 'pin', 'csv']
const fantasyFiles = [...walk('lib/fantasy'), ...walk('app/(frontend)/fantasy'), 'payload/collections/Fantasy.ts', 'payload/hooks/fantasy.ts', 'payload/components/FantasyView.tsx', ...walk('components/fantasy')].filter((f) => fs.existsSync(path.join(root, f)))

describe('fantasy guards', () => {
  it('the pure modules import no Next, no Payload and no server-only code', () => {
    for (const name of PURE) {
      const text = code(read(`lib/fantasy/${name}.ts`))
      expect(/from 'next|from 'payload'|from '@payloadcms|server-only|getPayloadClient|payload\s*\.\s*(find|findByID|create|update|delete|count)\s*\(/.test(text), name).toBe(false)
    }
  })
  it('no club name and no hex colour anywhere in the fantasy code', () => {
    expect(fantasyFiles.length).toBeGreaterThan(8)
    for (const f of fantasyFiles) {
      const text = code(read(f))
      expect(/lang\s*lang|langlang|llcc/i.test(text), `${f} names the club`).toBe(false)
      expect(/#[0-9a-f]{6}\b/i.test(text), `${f} has a hex colour`).toBe(false)
    }
  })
  it('nothing under the public fantasy route reads or writes data directly or overrides access', () => {
    const files = walk('app/(frontend)/fantasy')
    expect(files.length).toBeGreaterThan(3)
    for (const f of files) {
      const text = code(read(f))
      expect(/overrideAccess\s*:\s*true/.test(text), f).toBe(false)
      expect(/\.db\./.test(text), f).toBe(false)
      expect(/payload\s*\.\s*(find|findByID|create|update|delete|count)\s*\(/.test(text), `${f} reads or writes data directly`).toBe(false)
    }
  })
  it('no public path reads whole stored match bundles; fantasy uses the facts layer only', () => {
    for (const f of fantasyFiles) expect(/readStoredBundles/.test(code(read(f))), f).toBe(false)
  })
  it('every fantasy collection is written by code only, and squads and PIN fields cannot be read over REST', () => {
    const text = read('payload/collections/Fantasy.ts')
    expect(text).toContain('read: nobody')
    expect(text).toContain('read: isAdmin')
    for (const field of ['pinHash', 'pinSalt', 'deviceCodeHash', 'deviceCodeExpires']) expect(text).toMatch(new RegExp(`'${field}'[^\\n]*(secretField|access)`))
  })
  it('the lock hook is attached to squads and a join token is never printed', () => {
    expect(read('payload/collections/Fantasy.ts')).toContain('beforeChange: [fantasySquadLock]')
    for (const f of walk('app/(frontend)/fantasy')) {
      if (/play/.test(f)) continue
      expect(/fantasyToken\(/.test(code(read(f))), `${f} derives the join token`).toBe(false)
    }
  })
})
