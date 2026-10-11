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

describe('availability and squads guards (announce-teams spec 2, 4)', () => {
  it('nothing under the public availability route passes overrideAccess: true or touches the database directly', () => {
    const files = walk('app/(frontend)/availability')
    expect(files.length).toBeGreaterThan(1)
    for (const f of files) {
      const text = code(read(f))
      expect(/overrideAccess\s*:\s*true/.test(text), f).toBe(false)
      expect(/\.db\./.test(text), f).toBe(false)
      expect(/payload\s*\.\s*(find|findByID|create|update|delete|count)\s*\(/.test(text), `${f} reads or writes data directly`).toBe(false)
    }
  })

  it('every exported function of the selector query files checks the caller\'s role first', () => {
    for (const file of ['lib/selector-availability-queries.ts', 'lib/selector-squad-queries.ts', 'lib/selector-profile-queries.ts', 'lib/selector-team-queries.ts', 'lib/selector-votes-queries.ts']) {
      const text = code(read(file))
      const fns = [...text.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{\n([\s\S]*?)\n\}/g)]
      expect(fns.length, file).toBeGreaterThan(3)
      for (const [, name, params, body] of fns) {
        if (!/user: TypedUser/.test(params)) continue
        expect(body.split('\n').slice(0, 2).join('\n'), `${file} ${name} must call assertSelection(user) first`).toMatch(/assertSelection\(user\)/)
      }
    }
  })

  it('every selector server action starts with requireSelection()', () => {
    for (const [file, min] of [['app/(frontend)/selector/board-actions.ts', 12], ['app/(frontend)/selector/team-actions.ts', 3], ['app/(frontend)/selector/votes-actions.ts', 4]] as const) {
      const text = code(read(file))
      const fns = [...text.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([\s\S]*?)\n\}/g)]
      expect(fns.length, file).toBeGreaterThanOrEqual(min)
      for (const [, name, body] of fns) expect(body.split('\n')[0], name).toMatch(/requireSelection\(/)
    }
  })

  it('the availability link and the selector area are never cached and never leak the address in a referrer', async () => {
    const { default: config } = await import('../next.config')
    const rules = await (config as { headers: () => Promise<Array<{ source: string; headers: { key: string; value: string }[] }>> }).headers()
    for (const source of ['/availability/:path*', '/selector/:path*']) {
      const rule = rules.find((r) => r.source === source)
      expect(rule, source).toBeTruthy()
      const value = (k: string) => rule!.headers.find((h) => h.key === k)?.value
      expect(value('Cache-Control')).toMatch(/no-store/)
      expect(value('Referrer-Policy')).toBe('no-referrer')
      expect(value('X-Robots-Tag')).toMatch(/noindex/)
    }
  })

  it('robots keeps the availability link and the selector area out of search', async () => {
    const src = read('app/robots.ts')
    expect(src).toContain("'/availability/'")
    expect(src).toContain("'/selector'")
  })

  it('phones, PINs and selection data are in no export column set', () => {
    for (const file of ['lib/stats/statlab-columns.ts', 'lib/stats/csv.ts', 'lib/stats/statlab.ts', 'lib/history-import/export.ts']) {
      if (!fs.existsSync(path.join(root, file))) continue
      expect(/phone|pinHash|player-selection|otc/i.test(read(file)), file).toBe(false)
    }
  })

  it('the new paths sit inside the roots the brand-hex and club-name guards scan', () => {
    for (const p of ['app/(frontend)/availability', 'components/availability', 'components/selector', 'lib/availability.ts', 'lib/availability-link.ts', 'lib/availability-public.ts', 'lib/availability-throttle.ts', 'lib/selection', 'lib/selector-availability-queries.ts', 'lib/selector-squad-queries.ts', 'lib/selector-profile-queries.ts', 'lib/selector-team-queries.ts', 'lib/teams-queries.ts', 'lib/team-status.ts', 'app/(frontend)/teams', 'components/teams', 'app/(frontend)/votes', 'components/votes', 'lib/votes', 'lib/votes-queries.ts', 'lib/selector-votes-queries.ts', 'app/api/admin/votes-export']) {
      expect(fs.existsSync(path.join(root, p)), p).toBe(true)
      expect(/^(app|components|lib|payload|config)\//.test(p), p).toBe(true)
    }
  })
})
