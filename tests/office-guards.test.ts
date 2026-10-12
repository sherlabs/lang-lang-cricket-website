import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/**
 * Source guards for the club back office (wave D spec section 12). Personal data stays out of public code, every export goes through
 * the audited wrapper, and nothing office-related names a regional rule or a national law (that wording is configuration).
 */
const root = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

function walk(rel: string, out: string[] = []): string[] {
  const full = path.join(root, rel)
  if (!existsSync(full)) return out
  if (statSync(full).isDirectory()) for (const e of readdirSync(full)) walk(path.join(rel, e), out)
  else if (/\.(ts|tsx)$/.test(rel)) out.push(rel)
  return out
}

/** Routes under `app/(frontend)` that may touch office data. Empty until the volunteer and unsubscribe token routes exist. */
const PUBLIC_OFFICE_ALLOWLIST: string[] = []

const OFFICE_SOURCE = [
  ...walk('lib/office'),
  'lib/members-queries.ts',
  ...walk('app/api/admin/office'),
  ...walk('payload/components').filter((f) => path.basename(f).startsWith('Office')),
  'payload/collections/Members.ts',
  'payload/collections/OfficeAuditLog.ts',
  'payload/collections/officeAccess.ts',
  'payload/globals/OfficeSettings.ts',
]

describe('office guards', () => {
  it('scans the office source', () => {
    expect(OFFICE_SOURCE.length).toBeGreaterThan(15)
  })

  it('no public page or public query layer imports the office or the members queries', () => {
    const publicFiles = [...walk('app/(frontend)'), ...walk('lib').filter((f) => /-queries\.ts$/.test(f) && f !== 'lib/members-queries.ts'), ...walk('components')]
    const bad = publicFiles.filter((f) => !PUBLIC_OFFICE_ALLOWLIST.includes(f) && /members-queries|lib\/office|collection:\s*'(members|office-[a-z-]+)'/.test(read(f)))
    expect(bad).toEqual([])
  })

  it('there is no second CSV writer: exports use lib/stats/csv.ts', () => {
    expect(existsSync(path.join(root, 'lib/office/csv.ts'))).toBe(false)
    for (const f of OFFICE_SOURCE) expect(/function (csvCell|toCsv|needsGuard)\b/.test(read(f)), f).toBe(false)
  })

  it('every office export route goes through auditedExport; every other office route through requireOfficeAdmin', () => {
    const routes = walk('app/api/admin/office').filter((f) => f.endsWith('route.ts'))
    expect(routes.length).toBeGreaterThanOrEqual(4)
    for (const r of routes) {
      const text = read(r)
      if (r.includes('/export/')) expect(text, r).toContain('auditedExport')
      else expect(text, r).toContain('requireOfficeAdmin')
      expect(text, r).toMatch(/export async function POST/)
      expect(text, r).not.toMatch(/export async function GET/)
    }
  })

  it('the audited export checks admin and origin, sets no-store and writes the audit row before streaming', () => {
    const text = read('lib/office/export.ts')
    expect(text).toContain('isAdminUser')
    expect(text).toContain('exportOriginOk')
    expect(text).toContain("'Cache-Control': 'private, no-store'")
    expect(text.indexOf('writeAudit(')).toBeGreaterThan(-1)
    expect(text.indexOf('writeAudit(')).toBeLessThan(text.indexOf('new Response(toCsv'))
  })

  it('office files name no national law and no regional term (that wording is configuration)', () => {
    const banned = /\b(spam act|privacy act|gdpr|can-spam|pecr|suburb|postcode|canteen licen[cs]e|affiliation|agm)\b/i
    const hits: string[] = []
    for (const f of OFFICE_SOURCE) {
      const lines = read(f).split('\n')
      lines.forEach((line, i) => {
        if (banned.test(line)) hits.push(`${f}:${i + 1} ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('GraphQL stays disabled, so REST and the Local API are the only doors', async () => {
    const config = await loadSanitizedConfig()
    expect(config.graphQL.disable).toBe(true)
  }, 60_000)

  it('members is not exposed to any public query: the collection access is admin only', async () => {
    const config = await loadSanitizedConfig()
    const members = config.collections.find((c) => c.slug === 'members')!
    const asRead = members.access.read as (a: { req: { user: unknown } }) => unknown
    expect(asRead({ req: { user: undefined } })).toBe(false)
    expect(asRead({ req: { user: { id: 2, role: 'editor' } } })).toBe(false)
  })
})
