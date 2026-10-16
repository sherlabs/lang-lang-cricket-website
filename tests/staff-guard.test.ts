import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * "Staff" used to mean "any logged-in user". With a `selector` role that reading would hand a selector the committee's rights
 * (hidden players, unpublished news, merging players, draft preview, PlayHQ refresh), so every check goes through the helpers
 * in `payload/access` and nothing else may ask "is there a user". (Announce-teams spec 3.2.)
 */
const root = path.resolve(__dirname, '..')
const ROOTS = ['app', 'lib', 'payload', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', 'migrations'])
const ALLOWED_PREFIX = 'payload/access/'

const BANNED: Array<[string, RegExp]> = [
  ['Boolean(req.user)', /Boolean\(\s*(?:req\.)?user\s*\)/],
  ['!req.user', /!\s*req\.user\b(?!\s*\?\.)/],
  ['!user', /(?<![\w.])!\s*user\b(?!\s*[.\w(])/],
  ['req.user ?', /\breq\.user\s+\?(?!\.)/],
  ['user ?', /(?<![\w.])user\s+\?\s*['"`\w]/],
  ['if (req.user)', /\bif\s*\(\s*req\.user\s*\)/],
  ['if (user)', /\bif\s*\(\s*user\s*\)/],
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('staff guard: no code outside payload/access asks "is there a user"', () => {
  const files = ROOTS.flatMap((r) => walk(path.join(root, r)))
    .map((f) => path.relative(root, f))
    .filter((f) => !f.startsWith(ALLOWED_PREFIX))

  it('scans a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('the patterns catch the known mistakes', () => {
    const samples = ['Boolean(req.user)', 'if (!req.user) return', 'const x = req.user ? 1 : 2', 'return Boolean(user)', 'if (!user) {']
    for (const sample of samples) expect(BANNED.some(([, re]) => re.test(sample)), sample).toBe(true)
    for (const ok of ['req.user?.role', 'isStaffUser(req.user)', 'const { user } = x', '!userId']) expect(BANNED.some(([, re]) => re.test(ok)), ok).toBe(false)
  })

  it('finds none of the banned truthiness checks', () => {
    const hits: string[] = []
    for (const file of files) {
      const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        for (const [label, re] of BANNED) if (re.test(code)) hits.push(`${file}:${i + 1} ${label}: ${line.trim()}`)
      })
    }
    expect(hits, 'use isStaffUser / isAdminUser / isSelectionUser / isSignedIn from payload/access').toEqual([])
  })
})
