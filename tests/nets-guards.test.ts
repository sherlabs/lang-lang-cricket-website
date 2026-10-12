import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { needsGuard } from '@/lib/stats/csv'
import { sanitiseGuestName } from '@/lib/nets/guest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }), usePathname: () => '/selector/availability' }))

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')
const walk = (dir: string, out: string[] = []): string[] => {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) return out
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}
const NETS_FILES = [...walk('lib/nets'), ...walk('components/nets'), ...walk('app/(frontend)/selector/(area)/nets'), 'lib/nets-queries.ts', 'app/(frontend)/selector/nets-actions.ts', 'lib/selection/card.ts', 'components/selector/section-nav.tsx']

describe('net sessions: club vocabulary and guards (wave B spec 1)', () => {
  it('finds the net files', () => {
    expect(NETS_FILES.length).toBeGreaterThan(12)
  })
  it('no net file types a club name, a hex colour, a cookie name or a weekday', () => {
    for (const f of NETS_FILES) {
      const text = code(read(f))
      expect(/llcc|lang lang/i.test(text), `${f} types a club value`).toBe(false)
      expect(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(text), `${f} has a hex colour`).toBe(false)
      expect(/_avail['"`]/.test(text), `${f} types a cookie name`).toBe(false)
      expect(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text), `${f} types a weekday`).toBe(false)
      expect(/^(app|components|lib|payload|config)\//.test(f), f).toBe(true)
    }
  })
  it('every net query function checks the role first and every net action calls requireSelection first (also enforced in selection-guards)', () => {
    const q = code(read('lib/nets-queries.ts'))
    expect(q).toContain("import 'server-only'")
    expect(code(read('app/(frontend)/selector/nets-actions.ts'))).toContain('requireSelection(')
  })
  it('the state route is selection-guarded, 404s everyone else and is never cached', () => {
    const route = read('app/(frontend)/selector/(area)/nets/[id]/state/route.ts')
    expect(route).toContain('getSelectionUser(req.headers)')
    expect(route).toContain('no-store')
    expect(route).toMatch(/notFound\(\)/)
    expect(/overrideAccess|payload\./.test(code(route))).toBe(false)
  })
  it('selector pages carry no-store, no-referrer and noindex headers, which cover the state route', async () => {
    const { default: config } = await import('../next.config')
    const rules = await (config as { headers: () => Promise<Array<{ source: string; headers: { key: string; value: string }[] }>> }).headers()
    const rule = rules.find((r) => r.source === '/selector/:path*')!
    expect(rule.headers.find((h) => h.key === 'Cache-Control')?.value).toMatch(/no-store/)
    expect(rule.headers.find((h) => h.key === 'X-Robots-Tag')?.value).toMatch(/noindex/)
  })
  it('net attendance and guests are in no export column set and no public query', () => {
    for (const file of ['lib/stats/statlab-columns.ts', 'lib/stats/statlab.ts', 'lib/stats/csv.ts', 'lib/history-import/export.ts', 'app/api/admin/votes-export/route.ts', 'lib/votes/csv.ts']) {
      if (fs.existsSync(path.join(root, file))) expect(/attendance|net-sessions|net_sessions|guestName|checkedIn/i.test(read(file)), file).toBe(false)
    }
    const publicFiles = [...walk('app/(frontend)/votes'), ...walk('app/(frontend)/teams'), ...walk('app/(frontend)/players'), ...walk('app/(frontend)/stats'), 'lib/players-queries.ts', 'lib/teams-queries.ts', 'lib/votes-queries.ts']
    for (const f of publicFiles) if (fs.existsSync(path.join(root, f))) expect(/net-attendance|net-sessions/.test(read(f)), f).toBe(false)
  })
  it('the guest-name sanitiser and the CSV exporter share one formula rule', () => {
    expect(read('lib/nets/guest.ts')).toContain("from '../stats/csv'")
    for (const bad of ['=cmd', '@SUM', '+1', '-1', '\t=x']) expect(needsGuard(sanitiseGuestName(bad) ?? '')).toBe(false)
  })
})

describe('selector tab bar (wave B spec 4.1)', () => {
  it('renders exactly four tabs with 44 px tap targets and short labels, and Nets lights Availability', async () => {
    const { SelectorShell } = await import('@/components/selector/shell')
    const { selectorTabs } = await import('@/lib/selector-nav')
    const html = renderToStaticMarkup(SelectorShell({ name: 'Sam', signOut: null, children: null }))
    const bar = html.slice(html.lastIndexOf('<nav'))
    expect([...bar.matchAll(/<li>/g)]).toHaveLength(4)
    expect([...bar.matchAll(/min-h-14/g)]).toHaveLength(4)
    expect(bar).toContain('repeat(4, minmax(0, 1fr))')
    for (const t of selectorTabs) expect(t.label.length).toBeLessThanOrEqual(12)
    expect(/more/i.test(bar)).toBe(false)
  })
  it('the Availability section sub-nav has Availability, Nets and Link', async () => {
    const { AvailabilitySectionNav } = await import('@/components/selector/section-nav')
    const html = renderToStaticMarkup(AvailabilitySectionNav({ current: 'nets' }))
    expect(html).toMatch(/Availability[\s\S]*Nets[\s\S]*Link/)
    expect(html).toContain('aria-current="page"')
    expect(html.match(/min-h-11/g)).toHaveLength(3)
  })
})
