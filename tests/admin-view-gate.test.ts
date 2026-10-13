import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Custom admin views are reachable by anyone who knows the URL (Payload does not gate them), so every registered view must start
 * with `requireStaff` (wave G WP-0). The Home view is the exception: Payload redirects before it renders, and the page wrapper
 * (`app/(payload)/admin/[[...segments]]/page.tsx`) covers the false-bounce case for it.
 */
const root = path.resolve(__dirname, '..')
const config = fs.readFileSync(path.join(root, 'payload.config.ts'), 'utf8')
const registered = [...config.matchAll(/(\w+):\s*\{\s*Component:\s*'\/payload\/components\/(\w+)#(\w+)'/g)].map((m) => ({ key: m[1], file: m[2], name: m[3] }))

describe('every registered admin view calls requireStaff first', () => {
  it('finds the registered views', () => {
    expect(registered.length).toBeGreaterThan(25)
    expect(registered.map((r) => r.key)).toContain('social')
  })

  for (const view of registered.filter((r) => r.key !== 'dashboard')) {
    it(`${view.key} (${view.name})`, () => {
      const source = fs.readFileSync(path.join(root, 'payload/components', `${view.file}.tsx`), 'utf8')
      const fn = source.indexOf(`export async function ${view.name}`)
      expect(fn, `${view.name} must be an async function`).toBeGreaterThanOrEqual(0)
      const body = source.slice(fn)
      const gate = body.indexOf('requireStaff(')
      expect(gate, 'requireStaff is called').toBeGreaterThan(0)
      // before the first data read: nothing between the signature and the gate may await anything else
      expect(body.slice(0, gate + 13)).not.toMatch(/await (?!requireStaff)/)
      expect(body.slice(gate, gate + 160)).toContain('if (denied !== null) return denied')
    })
  }

  it('the old truthiness gate is gone', () => {
    const hits = fs.readdirSync(path.join(root, 'payload/components')).filter((f) => /\.tsx?$/.test(f)).filter((f) => fs.readFileSync(path.join(root, 'payload/components', f), 'utf8').includes('requireUser'))
    expect(hits).toEqual([])
  })
})

describe('no test hook ships in production code', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', 'tests', 'migrations'].includes(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, out)
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(full)
    }
    return out
  }
  it('nothing outside tests/ reads an ADMIN_TEST_* variable', () => {
    const files = ['app', 'lib', 'payload', 'components', 'config', 'scripts'].filter((d) => fs.existsSync(path.join(root, d))).flatMap((d) => walk(path.join(root, d)))
    expect(files.length).toBeGreaterThan(100)
    const hits = files.filter((f) => /ADMIN_TEST_/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f))
    expect(hits).toEqual([])
  })
})
